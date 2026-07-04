import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchCardsCollection, getPrices } from "@/lib/scryfall";

// Aktualisiert die Preise der gesamten Sammlung über Scryfalls
// Batch-Endpoint (75 Karten pro Request) – schnell genug auch für
// große Sammlungen, statt jede Karte einzeln abzufragen.
export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const { data: cards } = await supabase
    .from("cards")
    .select("id, scryfall_id, foil")
    .eq("user_id", user.id)
    .returns<{ id: string; scryfall_id: string; foil: boolean }[]>();

  if (!cards?.length) {
    return NextResponse.json({ updated: 0 });
  }

  // Eindeutige Scryfall-IDs sammeln und gebündelt abrufen
  const uniqueIds = Array.from(new Set(cards.map((c) => c.scryfall_id)));
  const cardMap = await fetchCardsCollection(
    uniqueIds.map((id) => ({ id }))
  );

  let updated = 0;
  const now = new Date().toISOString();

  for (const id of uniqueIds) {
    const scryfallCard = cardMap.get(id);
    if (!scryfallCard) continue;
    const { eur, eurFoil } = getPrices(scryfallCard);

    // Alle eigenen Zeilen dieses Drucks aktualisieren (normal + foil)
    const { error } = await supabase
      .from("cards")
      .update({
        price_eur: eur,
        price_eur_foil: eurFoil,
        price_updated_at: now,
      })
      .eq("user_id", user.id)
      .eq("scryfall_id", id);

    if (!error) updated += 1;

    // Preisverlauf festhalten
    await supabase.rpc("record_card_price", {
      p_scryfall_id: id,
      p_eur: eur,
      p_eur_foil: eurFoil,
    });
  }

  // Tages-Snapshot des Gesamtwerts schreiben
  await supabase.rpc("snapshot_collection_value");

  return NextResponse.json({ updated });
}
