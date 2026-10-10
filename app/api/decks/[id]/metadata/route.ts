import { requireUser, unauthorized } from "@/lib/apiAuth";
import { fetchCollectionWithRetry, sleep } from "@/lib/scryfall";
import { unionIdentity } from "@/lib/colorIdentity";

export const maxDuration = 60;

const CHUNK = 75;

// Füllt fehlende Farbidentitäten der Deckkarten aus Scryfall nach und setzt
// die Farbidentität des Decks neu = Vereinigung aller Commander. Früher wurde
// fälschlich "colors" des Commanders gespeichert (z. B. fehlten Farben aus
// Fähigkeitskosten, hybride Commander waren falsch).
// Antwort: { updated, colorIdentity }
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();

  const { data: deck } = await supabase
    .from("decks")
    .select("id, color_identity")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();
  if (!deck) return Response.json({ error: "Deck nicht gefunden" }, { status: 404 });

  const { data: rows, error } = await supabase
    .from("deck_cards")
    .select("id, scryfall_id, is_commander, color_identity, produced_mana")
    .eq("deck_id", params.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Fehlende Farbidentität oder Manaquellen (für die Mana-Basis-Analyse).
  const missing = (rows ?? []).filter((r) => r.color_identity == null || r.produced_mana == null);
  const ids = Array.from(new Set(missing.map((r) => r.scryfall_id as string)));
  const identityById = new Map<string, string[]>();
  const producedById = new Map<string, string[]>();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const cards = await fetchCollectionWithRetry(ids.slice(i, i + CHUNK).map((id) => ({ id })));
    for (const c of cards ?? []) {
      identityById.set(c.id, c.color_identity ?? c.colors ?? []);
      producedById.set(c.id, c.produced_mana ?? []);
    }
    if (i + CHUNK < ids.length) await sleep(100);
  }

  let updated = 0;
  for (const [scryfallId, identity] of identityById) {
    const { error: updateError, count } = await supabase
      .from("deck_cards")
      .update({ color_identity: identity, produced_mana: producedById.get(scryfallId) ?? [] }, { count: "exact" })
      .eq("deck_id", params.id)
      .eq("scryfall_id", scryfallId);
    if (!updateError) updated += count ?? 0;
  }

  // Deck-Identität aus allen Commander-Zeilen neu berechnen.
  const commanders = (rows ?? []).filter((r) => r.is_commander);
  const colorIdentity = unionIdentity(
    commanders.map((r) => (r.color_identity as string[] | null) ?? identityById.get(r.scryfall_id as string) ?? [])
  );
  if (commanders.length && colorIdentity.join() !== ((deck.color_identity as string[] | null) ?? []).join()) {
    await supabase.from("decks").update({ color_identity: colorIdentity }).eq("id", params.id).eq("user_id", user.id);
  }

  return Response.json({ updated, colorIdentity });
}
