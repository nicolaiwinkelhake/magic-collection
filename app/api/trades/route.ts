import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchCardByName, getPrices, sleep } from "@/lib/scryfall";
import { parseDeckList } from "@/lib/parseDeckList";

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { partnerEmail, give, receive, note } = body;

  // Direkt aus Sammlungen (geteilte Sammlung → "Trade anfragen"):
  // { partnerId, receiveCards: [{id, quantity}], giveCards: [{id, quantity}], note }
  const structured = Array.isArray(body.receiveCards) || Array.isArray(body.giveCards);

  // Partner auflösen
  let partnerId: string;
  if (structured) {
    if (typeof body.partnerId !== "string" || !UUID.test(body.partnerId)) {
      return NextResponse.json({ error: "Handelspartner fehlt" }, { status: 400 });
    }
    partnerId = body.partnerId;
  } else {
    const { data: found } = await supabase.rpc("find_user_by_email", {
      search_email: (partnerEmail ?? "").trim(),
    });
    if (!found?.length) {
      return NextResponse.json(
        { error: "Kein Nutzer mit dieser E-Mail gefunden" },
        { status: 404 }
      );
    }
    partnerId = found[0].id;
  }

  if (partnerId === user.id) {
    return NextResponse.json(
      { error: "Du kannst nicht mit dir selbst handeln" },
      { status: 400 }
    );
  }

  // Nur mit bestätigten Freunden handeln
  const { data: friendship } = await supabase
    .from("friendships")
    .select("id")
    .eq("status", "accepted")
    .or(
      `and(user_id.eq.${user.id},friend_id.eq.${partnerId}),and(user_id.eq.${partnerId},friend_id.eq.${user.id})`
    )
    .limit(1);

  if (!friendship?.length) {
    return NextResponse.json(
      { error: "Trades sind nur mit bestätigten Freunden möglich" },
      { status: 403 }
    );
  }

  if (structured) {
    const built = await buildFromCollections(supabase, user.id, partnerId, body.giveCards, body.receiveCards);
    if ("error" in built) return NextResponse.json({ error: built.error }, { status: built.status });
    return insertTrade(supabase, user.id, partnerId, note, built.items, []);
  }

  const giveEntries = parseDeckList(give ?? "");
  const receiveEntries = parseDeckList(receive ?? "");

  if (!giveEntries.length && !receiveEntries.length) {
    return NextResponse.json(
      { error: "Mindestens eine Karte angeben" },
      { status: 400 }
    );
  }

  // Karten auflösen (eindeutige Namen einmal abrufen)
  const allNames = Array.from(
    new Set([...giveEntries, ...receiveEntries].map((e) => e.name))
  );
  const resolved = new Map<string, Awaited<ReturnType<typeof fetchCardByName>>>();
  for (const name of allNames) {
    resolved.set(name, await fetchCardByName(name));
    await sleep(100);
  }

  const notFound: string[] = [];
  function buildItems(
    entries: ReturnType<typeof parseDeckList>,
    fromUserId: string
  ) {
    const items: any[] = [];
    for (const e of entries) {
      const r = resolved.get(e.name);
      if (!r?.card) {
        if (!notFound.includes(e.name)) notFound.push(e.name);
        continue;
      }
      const { eur, eurFoil } = getPrices(r.card);
      items.push({
        from_user_id: fromUserId,
        scryfall_id: r.card.id,
        name: r.card.name,
        image_url: r.imageUrl,
        foil: e.foil,
        quantity: e.quantity,
        price_eur_at_trade: e.foil ? eurFoil ?? eur : eur,
      });
    }
    return items;
  }

  const items = [
    ...buildItems(giveEntries, user.id),
    ...buildItems(receiveEntries, partnerId),
  ];

  if (!items.length) {
    return NextResponse.json(
      { error: `Keine Karten gefunden: ${notFound.join(", ")}` },
      { status: 400 }
    );
  }

  return insertTrade(supabase, user.id, partnerId, note, items, notFound);
}

const UUID = /^[0-9a-f-]{36}$/i;

type Supabase = ReturnType<typeof createClient>;
type TradeItemRow = {
  from_user_id: string;
  scryfall_id: string;
  name: string;
  image_url: string | null;
  foil: boolean;
  quantity: number;
  price_eur_at_trade: number | null;
};

// Trade + Positionen anlegen; scheitern die Positionen, wird der Trade
// wieder entfernt.
async function insertTrade(
  supabase: Supabase,
  userId: string,
  partnerId: string,
  note: unknown,
  items: TradeItemRow[],
  notFound: string[],
) {
  const { data: trade, error: tradeError } = await supabase
    .from("trades")
    .insert({
      proposer_id: userId,
      partner_id: partnerId,
      note: typeof note === "string" && note.trim() ? note.trim().slice(0, 500) : null,
    })
    .select()
    .single();

  if (tradeError) {
    return NextResponse.json({ error: tradeError.message }, { status: 500 });
  }

  const { error: itemsError } = await supabase
    .from("trade_items")
    .insert(items.map((i) => ({ ...i, trade_id: trade.id })));

  if (itemsError) {
    await supabase.from("trades").delete().eq("id", trade.id);
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  return NextResponse.json({ tradeId: trade.id, notFound });
}

type CardRow = {
  id: string;
  scryfall_id: string;
  name: string;
  image_url: string | null;
  foil: boolean;
  quantity: number;
  price_eur: number | null;
  price_eur_foil: number | null;
};

// Positionen aus Sammlungseinträgen: eigene Karten (geben) und Karten aus der
// geteilten Sammlung des Partners (bekommen). Name, Druck und Preis kommen
// aus der Datenbank, Mengen werden auf den Bestand begrenzt.
async function buildFromCollections(
  supabase: Supabase,
  userId: string,
  partnerId: string,
  giveRaw: unknown,
  receiveRaw: unknown,
): Promise<{ items: TradeItemRow[] } | { error: string; status: number }> {
  const parse = (raw: unknown) =>
    (Array.isArray(raw) ? raw : [])
      .filter((x): x is { id: string; quantity: unknown } => !!x && typeof x.id === "string" && UUID.test(x.id))
      .slice(0, 200)
      .map((x) => ({ id: x.id, quantity: Math.max(1, Math.floor(Number(x.quantity) || 1)) }));
  const give = parse(giveRaw);
  const receive = parse(receiveRaw);
  if (!give.length && !receive.length) return { error: "Mindestens eine Karte angeben", status: 400 };

  const cols = "id, scryfall_id, name, image_url, foil, quantity, price_eur, price_eur_foil";
  let mine: CardRow[] = [];
  if (give.length) {
    const { data, error } = await supabase
      .from("cards")
      .select(cols)
      .eq("user_id", userId)
      .in("id", give.map((g) => g.id));
    if (error) return { error: error.message, status: 500 };
    mine = (data ?? []) as CardRow[];
  }
  let theirs: CardRow[] = [];
  if (receive.length) {
    // Nur sichtbar, wenn der Partner seine Sammlung mit mir teilt
    const { data, error } = await supabase
      .rpc("shared_collection", { p_owner: partnerId })
      .select(cols)
      .in("id", receive.map((r) => r.id));
    if (error) return { error: error.message, status: 500 };
    theirs = (data ?? []) as CardRow[];
  }

  const toItem = (row: CardRow, qty: number, from: string): TradeItemRow => ({
    from_user_id: from,
    scryfall_id: row.scryfall_id,
    name: row.name,
    image_url: row.image_url,
    foil: row.foil,
    quantity: Math.min(qty, row.quantity),
    price_eur_at_trade: row.foil ? row.price_eur_foil ?? row.price_eur : row.price_eur,
  });
  const items: TradeItemRow[] = [];
  for (const g of give) {
    const row = mine.find((m) => m.id === g.id);
    if (row) items.push(toItem(row, g.quantity, userId));
  }
  for (const r of receive) {
    const row = theirs.find((t) => t.id === r.id);
    if (row) items.push(toItem(row, r.quantity, partnerId));
  }
  if (items.length !== give.length + receive.length) {
    return { error: "Einige Karten sind nicht (mehr) in der Sammlung – bitte neu laden.", status: 409 };
  }
  return { items };
}
