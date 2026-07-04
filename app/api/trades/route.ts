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

  const { partnerEmail, give, receive, note } = await request.json();

  // Partner auflösen
  const { data: found } = await supabase.rpc("find_user_by_email", {
    search_email: (partnerEmail ?? "").trim(),
  });
  if (!found?.length) {
    return NextResponse.json(
      { error: "Kein Nutzer mit dieser E-Mail gefunden" },
      { status: 404 }
    );
  }
  const partnerId = found[0].id;

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

  // Trade anlegen
  const { data: trade, error: tradeError } = await supabase
    .from("trades")
    .insert({
      proposer_id: user.id,
      partner_id: partnerId,
      note: note?.trim() || null,
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
    // Trade ohne Positionen wieder entfernen
    await supabase.from("trades").delete().eq("id", trade.id);
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  return NextResponse.json({ tradeId: trade.id, notFound });
}
