import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPrices, type ScryfallCard } from "@/lib/scryfall";
import { resolveCards, ResolveUnavailableError, type ResolveInput } from "@/lib/resolveCards";

export const maxDuration = 60;

type IncomingEntry = {
  name?: string;
  quantity?: number;
  foil?: boolean;
  scryfallId?: string;
  set?: string;
  collectorNumber?: string;
};

// Karten zu einem Deck hinzufügen (bzw. Deckliste ersetzen).
// Body: { entries: [{ name, quantity, foil, scryfallId?, set?, collectorNumber? }] }
//    oder { nameEntries: [{ name, quantity }] } / { names: string[] }
//       + replace?: boolean, addToCollection?: boolean
// Ablauf: ERST alle Karten auflösen (Scryfall-ID → Set+Nummer → Name →
// Fuzzy), DANN schreiben. Ist Scryfall nicht erreichbar, antwortet die Route
// mit 503, bevor irgendetwas geändert wurde – auch beim Ersetzen bleibt die
// alte Deckliste dann unangetastet.
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const { data: deck } = await supabase
    .from("decks")
    .select("id")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (!deck) {
    return NextResponse.json({ error: "Deck nicht gefunden" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  // false: Karten nur ins Deck legen (z. B. eine bereits besessene Karte aus
  // den Vorschlägen übernehmen) – sonst würde die Sammlung doppelt zählen.
  const addToCollection = body.addToCollection !== false;

  const raw: IncomingEntry[] = body.entries?.length
    ? body.entries
    : body.nameEntries ?? (body.names ?? []).map((n: string) => ({ name: n, quantity: 1 }));

  const items: Array<ResolveInput & { quantity: number; foil: boolean }> = raw
    .map((e, i) => ({
      i,
      // Set-Code, Sammlernummer und Kategorie-Tags aus Textzeilen entfernen
      name: (e.name ?? "")
        .replace(/\s*\([a-z0-9]+\)\s*\d*\s*/gi, " ")
        .replace(/\s*\[[^\]]*\]/g, "")
        .trim(),
      scryfallId: e.scryfallId || undefined,
      set: e.set || undefined,
      collectorNumber: e.collectorNumber || undefined,
      quantity: Math.max(1, Math.floor(Number(e.quantity) || 1)),
      foil: Boolean(e.foil),
    }))
    .filter((e) => e.name || e.scryfallId);

  if (!items.length) {
    return NextResponse.json({ error: "Keine Karten übergeben" }, { status: 400 });
  }

  // 1) Auflösen – noch keine Änderung an Deck oder Sammlung.
  let resolved: Map<number, ScryfallCard>;
  try {
    resolved = await resolveCards(items);
  } catch (err) {
    const status = err instanceof ResolveUnavailableError ? 503 : 500;
    console.error("Deck-Import: Auflösung fehlgeschlagen", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Kartendaten konnten nicht geladen werden" },
      { status }
    );
  }

  const notFound = Array.from(new Set(items.filter((it) => !resolved.has(it.i)).map((it) => it.name || it.scryfallId!)));

  if (!resolved.size) {
    // Beim Ersetzen nie mit einer leeren Liste die alte Deckliste löschen.
    return NextResponse.json(
      { error: "Keine der Karten wurde gefunden – Deck unverändert.", inserted: 0, notFound, repeated: [] },
      { status: 422 }
    );
  }

  // 2) Bestehende Deckliste ersetzen statt ergänzen: alte (Nicht-Commander-)
  // Deckkarten entfernen und ihre Menge aus der Sammlung wieder abziehen.
  // Verhindert doppelt gezählte Mengen bei erneutem Import derselben Liste.
  if (body.replace) {
    const { data: oldCards } = await supabase
      .from("deck_cards")
      .select("id, scryfall_id")
      .eq("deck_id", params.id)
      .eq("user_id", user.id)
      .eq("is_commander", false);

    if (oldCards?.length) {
      const oldQtyByScryfallId = new Map<string, number>();
      for (const c of oldCards) {
        oldQtyByScryfallId.set(c.scryfall_id, (oldQtyByScryfallId.get(c.scryfall_id) ?? 0) + 1);
      }

      if (addToCollection) {
        const { data: collectionRowsForDeck } = await supabase
          .from("cards")
          .select("id, scryfall_id, quantity")
          .eq("user_id", user.id)
          .eq("foil", false)
          .in("scryfall_id", Array.from(oldQtyByScryfallId.keys()));

        for (const row of collectionRowsForDeck ?? []) {
          const oldQty = oldQtyByScryfallId.get(row.scryfall_id) ?? 0;
          const newQty = row.quantity - oldQty;
          if (newQty <= 0) {
            await supabase.from("cards").delete().eq("id", row.id);
          } else {
            await supabase.from("cards").update({ quantity: newQty }).eq("id", row.id);
          }
        }
      }

      await supabase
        .from("deck_cards")
        .delete()
        .eq("deck_id", params.id)
        .eq("user_id", user.id)
        .eq("is_commander", false);
    }
  }

  // 3) Zusammenfassen: je Karte (+ Foil) eine Menge.
  const groups = new Map<string, { card: ScryfallCard; foil: boolean; qty: number }>();
  for (const it of items) {
    const card = resolved.get(it.i);
    if (!card) continue;
    const key = `${card.id}_${it.foil}`;
    const g = groups.get(key);
    if (g) g.qty += it.quantity;
    else groups.set(key, { card, foil: it.foil, qty: it.quantity });
  }

  const qtyByCard = new Map<string, { name: string; qty: number }>();
  const rowsToInsert: Record<string, unknown>[] = [];
  for (const { card, qty } of groups.values()) {
    const prev = qtyByCard.get(card.id);
    qtyByCard.set(card.id, { name: card.name, qty: (prev?.qty ?? 0) + qty });
    const { eur, eurFoil } = getPrices(card);
    for (let n = 0; n < qty; n++) {
      rowsToInsert.push({
        deck_id: params.id,
        user_id: user.id,
        scryfall_id: card.id,
        name: card.name,
        image_url: imageUrlOf(card),
        mana_cost: card.mana_cost ?? null,
        cmc: card.cmc,
        type_line: card.type_line,
        colors: card.colors ?? [],
        color_identity: card.color_identity ?? card.colors ?? [],
        produced_mana: card.produced_mana ?? [],
        oracle_text: card.oracle_text ?? null,
        is_commander: false,
        price_eur: eur,
        price_eur_foil: eurFoil,
      });
    }
  }
  const repeated = Array.from(qtyByCard.values())
    .filter((v) => v.qty > 1)
    .map((v) => ({ name: v.name, count: v.qty }));

  // 4) Schreiben.
  const { data: insertedData, error: insertError } = await supabase
    .from("deck_cards")
    .insert(rowsToInsert)
    .select("id");
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  const inserted = insertedData?.length ?? rowsToInsert.length;

  if (addToCollection) {
    // Bestehende Menge in der Sammlung wird addiert statt überschrieben.
    const ids = Array.from(new Set(Array.from(groups.values()).map((g) => g.card.id)));
    const { data: existingRows } = await supabase
      .from("cards")
      .select("scryfall_id,foil,quantity")
      .eq("user_id", user.id)
      .in("scryfall_id", ids);
    const existingQty = new Map<string, number>(
      (existingRows ?? []).map((r) => [`${r.scryfall_id}_${r.foil}`, r.quantity as number])
    );
    const collectionRows = Array.from(groups.values()).map(({ card, foil, qty }) => {
      const { eur, eurFoil } = getPrices(card);
      return {
        user_id: user.id,
        scryfall_id: card.id,
        name: card.name,
        image_url: imageUrlOf(card),
        mana_cost: card.mana_cost ?? null,
        cmc: card.cmc,
        type_line: card.type_line,
        colors: card.colors ?? [],
        oracle_text: card.oracle_text ?? null,
        rarity: card.rarity,
        set_code: card.set,
        collector_number: card.collector_number,
        quantity: (existingQty.get(`${card.id}_${foil}`) ?? 0) + qty,
        foil,
        price_eur: eur,
        price_eur_foil: eurFoil,
        price_updated_at: new Date().toISOString(),
      };
    });
    const { error: upsertError } = await supabase
      .from("cards")
      .upsert(collectionRows, { onConflict: "user_id,scryfall_id,foil" });
    if (upsertError) console.error("Deck-Import: Sammlung nicht aktualisiert", upsertError);
  }

  // Preisverlauf je Karte festhalten (einmal pro Karte, unabhängig von der Menge)
  for (const card of new Map(Array.from(groups.values()).map((g) => [g.card.id, g.card])).values()) {
    const { eur, eurFoil } = getPrices(card);
    await supabase.rpc("record_card_price", { p_scryfall_id: card.id, p_eur: eur, p_eur_foil: eurFoil });
  }

  return NextResponse.json({ inserted, notFound, repeated });
}

function imageUrlOf(card: ScryfallCard): string | null {
  return card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal ?? null;
}

// Einzelne Deckkarte entfernen (der Commander kann nicht gelöscht werden).
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  const { cardId } = await request.json();
  const { error } = await supabase
    .from("deck_cards")
    .delete()
    .eq("id", cardId)
    .eq("deck_id", params.id)
    .eq("user_id", user.id)
    .eq("is_commander", false);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
