import { requireUser, unauthorized } from "@/lib/apiAuth";
import { fetchCardsCollection } from "@/lib/scryfall";
import { cachedSearch, type CompactCard } from "@/lib/scryfallCache";
import { selectAll } from "@/lib/supabase/selectAll";
import { buildablePoolSpecs, identityKey, scorePool } from "@/lib/discover";

export const maxDuration = 300;

// "Welche Commander kann ich bauen?" – für jede Legende der Sammlung: Anteil
// der typischen Karten ihrer Farben, den ich schon besitze, und Wert der
// fehlenden. Pools je Farbidentität (gecacht), daher ohne Claude-Aufrufe.
export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();

  const legends = await selectAll<{ name: string; scryfall_id: string; type_line: string | null; oracle_text: string | null }>(() =>
    supabase
      .from("cards")
      .select("name, scryfall_id, type_line, oracle_text")
      .eq("user_id", user.id)
      .ilike("type_line", "%Legendary%")
      .order("id")
  );
  const candidates = Array.from(
    new Map(
      legends
        .filter((c) => /Creature/.test(c.type_line ?? "") || /can be your commander/i.test(c.oracle_text ?? ""))
        .map((c) => [c.name, c])
    ).values()
  ).slice(0, 200);
  if (!candidates.length) return Response.json({ commanders: [] });

  const scryfall = await fetchCardsCollection(candidates.map((c) => ({ id: c.scryfall_id })));

  const allOwned = await selectAll<{ name: string }>(() =>
    supabase.from("cards").select("name").eq("user_id", user.id).order("id")
  );
  const ownedNames = new Set(allOwned.map((c) => c.name));

  const { data: decks } = await supabase.from("decks").select("commander_name").eq("user_id", user.id);
  const withDeck = new Set((decks ?? []).map((d) => d.commander_name as string));

  // Pools je Farbidentität einmal laden.
  const pools = new Map<string, CompactCard[]>();
  const result = [];
  for (const cand of candidates) {
    const card = scryfall.get(cand.scryfall_id);
    if (!card) continue;
    const identity = card.color_identity ?? card.colors ?? [];
    const key = identityKey(identity);
    if (!pools.has(key)) {
      const pool: CompactCard[] = [];
      for (const spec of buildablePoolSpecs(identity)) {
        pool.push(...(await cachedSearch(supabase, spec.query, { order: spec.order, limit: spec.limit, ttlDays: spec.ttlDays })));
      }
      pools.set(key, pool);
    }
    const score = scorePool(pools.get(key)!.filter((c) => c.name !== card.name), ownedNames);
    const raw = card as unknown as { edhrec_rank?: number };
    result.push({
      name: card.name,
      image: card.image_uris?.normal ?? card.card_faces?.[0]?.image_uris?.normal ?? null,
      identity,
      rank: raw.edhrec_rank ?? null,
      hasDeck: withDeck.has(card.name),
      ...score,
    });
  }

  result.sort((a, b) => b.share - a.share || a.missingValue - b.missingValue);
  return Response.json({ commanders: result });
}
