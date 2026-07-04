import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchCardsCollection, getPrices } from "@/lib/scryfall";
import { cardValue } from "@/lib/valuation";

export const maxDuration = 60;

// Nächtlicher Preis-Job: aktualisiert Kartenpreise für ALLE Nutzer über den
// Scryfall-Batch-Endpoint, schreibt den globalen Preisverlauf und die
// Tages-Snapshots für Sammlungen und Decks. Läuft mit Service-Role (umgeht
// RLS) und ist durch ein Bearer-Secret geschützt.
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (
    !process.env.CRON_SECRET ||
    auth !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const today = new Date().toISOString();

  // Alle Karten (aller Nutzer)
  const { data: cards } = await supabase
    .from("cards")
    .select("scryfall_id");
  const uniqueIds = Array.from(
    new Set((cards ?? []).map((c: any) => c.scryfall_id))
  );

  if (uniqueIds.length === 0) {
    return NextResponse.json({ updatedPrints: 0 });
  }

  // Preise gebündelt abrufen
  const cardMap = await fetchCardsCollection(uniqueIds.map((id) => ({ id })));

  let updatedPrints = 0;
  for (const id of uniqueIds) {
    const scryfallCard = cardMap.get(id);
    if (!scryfallCard) continue;
    const { eur, eurFoil } = getPrices(scryfallCard);

    // Preisverlauf (global, pro Tag)
    await supabase
      .from("card_price_history")
      .upsert(
        { scryfall_id: id, price_eur: eur, price_eur_foil: eurFoil },
        { onConflict: "scryfall_id,captured_on" }
      );

    // Aktuelle Preise in allen Nutzer-Sammlungen und Decks setzen
    await supabase
      .from("cards")
      .update({ price_eur: eur, price_eur_foil: eurFoil, price_updated_at: today })
      .eq("scryfall_id", id);
    await supabase
      .from("deck_cards")
      .update({ price_eur: eur, price_eur_foil: eurFoil })
      .eq("scryfall_id", id);

    updatedPrints += 1;
  }

  // Sammlungswert-Snapshot je Nutzer (zustandsbereinigt, zentrale Logik)
  const { data: allCards } = await supabase
    .from("cards")
    .select("user_id, quantity, foil, price_eur, price_eur_foil, condition");
  const byUser = new Map<string, number>();
  for (const c of (allCards ?? []) as any[]) {
    byUser.set(c.user_id, (byUser.get(c.user_id) ?? 0) + cardValue(c));
  }
  for (const [user_id, total] of byUser.entries()) {
    await supabase
      .from("collection_value_history")
      .upsert(
        { user_id, total_value_eur: total },
        { onConflict: "user_id,captured_on" }
      );
  }

  // Deckwert-Snapshot je Deck
  const { data: deckCards } = await supabase
    .from("deck_cards")
    .select("deck_id, price_eur");
  const byDeck = new Map<string, number>();
  for (const c of (deckCards ?? []) as any[]) {
    byDeck.set(c.deck_id, (byDeck.get(c.deck_id) ?? 0) + (c.price_eur ?? 0));
  }
  for (const [deck_id, total] of byDeck.entries()) {
    await supabase
      .from("deck_value_history")
      .upsert(
        { deck_id, total_value_eur: total },
        { onConflict: "deck_id,captured_on" }
      );
  }

  return NextResponse.json({
    updatedPrints,
    users: byUser.size,
    decks: byDeck.size,
  });
}
