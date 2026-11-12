import { requireUser, unauthorized } from "@/lib/apiAuth";
import { findCombos } from "@/lib/commanderSpellbook";
import { getCommander } from "@/lib/edhrec";
import { isLand } from "@/lib/cardRoles";
import { commandersOf, loadCardInfo, loadFriendCards, loadMyCards, loadMyDecks, ownership } from "@/lib/discoverData";

export const maxDuration = 60;

// Synergien in der eigenen Sammlung:
// 1) Combos (Commander Spellbook), die ich komplett besitze – und solche,
//    bei denen genau eine Karte fehlt (hat sie ein Freund? was kostet sie?)
// 2) Ungenutzte Karten mit Potenzial: freie Karten, die laut EDHREC gut in
//    eines meiner Decks passen.
export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();
  const [decks, myCards, friends] = await Promise.all([loadMyDecks(supabase, user.id), loadMyCards(supabase, user.id), loadFriendCards(supabase)]);
  const own = ownership(myCards, decks);

  // Commander Spellbook nimmt höchstens 600 Karten: zuerst alles aus den
  // Decks, dann die wertvollsten übrigen Nicht-Länder.
  const deckNames = Array.from(new Set(decks.flatMap((d) => d.cards.map((c) => c.name))));
  const rest = Array.from(
    new Map(
      myCards
        .filter((c) => !isLand(c) && !deckNames.includes(c.name))
        .sort((a, b) => (b.price_eur ?? 0) - (a.price_eur ?? 0))
        .map((c) => [c.name, c.name]),
    ).values(),
  );
  const pool = [...deckNames, ...rest].slice(0, 600);
  const combos = pool.length ? await findCombos(pool, []) : null;

  const deckWith = (cards: string[]) => decks.find((d) => cards.every((n) => d.cards.some((c) => c.name === n)))?.name ?? null;
  const complete = (combos?.included ?? []).slice(0, 15).map((c) => ({
    cards: c.cards,
    produces: c.produces.slice(0, 3),
    description: c.description,
    inDeck: deckWith(c.cards),
  }));
  const almostRaw = (combos?.almostIncluded ?? []).filter((c) => c.missing.length === 1).slice(0, 15);
  const info = await loadCardInfo(supabase, almostRaw.map((c) => c.missing[0]));
  const almost = almostRaw.map((c) => {
    const missing = c.missing[0];
    const f = friends.byName.get(missing) ?? [];
    return {
      cards: c.cards,
      produces: c.produces.slice(0, 3),
      description: c.description,
      missing,
      missingEur: info.get(missing)?.eur ?? null,
      missingImage: info.get(missing)?.image ?? null,
      friends: f,
    };
  });

  // Ungenutzte Karten: freie eigene Karten aus den EDHREC-Listen meiner Decks
  const best = new Map<string, { name: string; deck: string; deckId: string; inclusion: number; synergy: number; score: number; image: string | null; eur: number | null }>();
  const imageOf = new Map(myCards.map((c) => [c.name, c] as const));
  for (const deck of decks) {
    const edh = await getCommander(supabase, commandersOf(deck));
    if (!edh) continue;
    const inDeck = new Set(deck.cards.map((c) => c.name));
    for (const e of edh.cards) {
      if (inDeck.has(e.name) || !(own.get(e.name)?.free)) continue;
      if (e.inclusion < 0.15 && e.synergy < 0.15) continue;
      const score = e.inclusion * 1.2 + Math.max(0, e.synergy) * 0.8;
      const prev = best.get(e.name);
      if (!prev || prev.score < score) {
        const mine = imageOf.get(e.name);
        best.set(e.name, { name: e.name, deck: deck.name, deckId: deck.id, inclusion: e.inclusion, synergy: e.synergy, score, image: mine?.image_url ?? null, eur: mine?.price_eur ?? null });
      }
    }
  }
  const unused = Array.from(best.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  return Response.json({
    poolSize: pool.length,
    combosAvailable: combos != null,
    complete,
    almost,
    unused,
  });
}
