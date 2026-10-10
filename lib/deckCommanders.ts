import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCardByName, getPrices, type ScryfallCard } from "@/lib/scryfall";

// Gemeinsame Helfer für Commander (+ Partner/Background) in Decks.

export type ResolvedCommander = { card: ScryfallCard; imageUrl: string | null };

export async function resolveCommander(name: string): Promise<ResolvedCommander | { error: string }> {
  const { card, imageUrl, error } = await fetchCardByName(name);
  if (!card) return { error: error ?? `Commander „${name}“ nicht gefunden` };
  return { card, imageUrl };
}

export function identityOf(card: ScryfallCard): string[] {
  return card.color_identity ?? card.colors ?? [];
}

export function commanderDeckRow(deckId: string, userId: string, c: ResolvedCommander) {
  const { eur, eurFoil } = getPrices(c.card);
  return {
    deck_id: deckId,
    user_id: userId,
    scryfall_id: c.card.id,
    name: c.card.name,
    image_url: c.imageUrl,
    mana_cost: c.card.mana_cost ?? null,
    cmc: c.card.cmc,
    type_line: c.card.type_line,
    colors: c.card.colors ?? [],
    color_identity: identityOf(c.card),
    produced_mana: c.card.produced_mana ?? [],
    oracle_text: c.card.oracle_text ?? null,
    is_commander: true,
    price_eur: eur,
    price_eur_foil: eurFoil,
  };
}

// Commander auch in die Sammlung eintragen; bestehende Menge wird erhöht.
export async function addCommanderToCollection(supabase: SupabaseClient, userId: string, c: ResolvedCommander) {
  const { eur, eurFoil } = getPrices(c.card);
  const { data: existing } = await supabase
    .from("cards")
    .select("quantity")
    .eq("user_id", userId)
    .eq("scryfall_id", c.card.id)
    .eq("foil", false)
    .maybeSingle();

  await supabase.from("cards").upsert(
    {
      user_id: userId,
      scryfall_id: c.card.id,
      name: c.card.name,
      image_url: c.imageUrl,
      mana_cost: c.card.mana_cost ?? null,
      cmc: c.card.cmc,
      type_line: c.card.type_line,
      colors: c.card.colors ?? [],
      oracle_text: c.card.oracle_text ?? null,
      rarity: c.card.rarity,
      set_code: c.card.set,
      collector_number: c.card.collector_number,
      quantity: (existing?.quantity ?? 0) + 1,
      foil: false,
      price_eur: eur,
      price_eur_foil: eurFoil,
      price_updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,scryfall_id,foil" }
  );
}
