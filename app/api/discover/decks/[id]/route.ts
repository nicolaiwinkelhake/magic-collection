import { requireUser, unauthorized } from "@/lib/apiAuth";
import { getCommander } from "@/lib/edhrec";
import { availabilityFor, commandersOf, loadCardInfo, loadFriendCards, loadMyCards, loadMyDecks, loadRoles, ownership } from "@/lib/discoverData";
import { deckHealth, healthLabel, planSwaps } from "@/lib/deckDoctor";

export const maxDuration = 60;

// Deck-Check für ein Deck: Gesundheit + konkrete Tausche ("raus X → rein Y")
// auf Basis der EDHREC-Statistik des Commanders, jeweils mit Quelle:
// eigene freie Karte, Freund (geteilte Sammlung) oder kaufen.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();
  const decks = await loadMyDecks(supabase, user.id);
  const deck = decks.find((d) => d.id === params.id);
  if (!deck) return Response.json({ error: "Deck nicht gefunden" }, { status: 404 });

  const commanders = commandersOf(deck);
  const [edh, myCards, friends] = await Promise.all([
    getCommander(supabase, commanders),
    loadMyCards(supabase, user.id),
    loadFriendCards(supabase),
  ]);
  const own = ownership(myCards, decks);

  // Kandidaten: die relevantesten EDHREC-Karten, die noch nicht im Deck sind
  const inDeck = new Set(deck.cards.map((c) => c.name));
  const candidates = (edh?.cards ?? [])
    .filter((c) => !inDeck.has(c.name))
    .sort((a, b) => b.inclusion + Math.max(0, b.synergy) - (a.inclusion + Math.max(0, a.synergy)))
    .slice(0, 70);
  const candNames = candidates.map((c) => c.name);
  const [info, roles] = await Promise.all([
    loadCardInfo(supabase, candNames),
    loadRoles(supabase, [...deck.cards.map((c) => c.name), ...candNames], 60),
  ]);
  const health = deckHealth(deck.cards, roles);
  const { swaps, adds } = planSwaps({
    deck: deck.cards,
    identity: deck.color_identity,
    commanderNames: commanders,
    edhrec: edh?.cards ?? [],
    roles,
    info,
    availability: availabilityFor(candNames, own, friends.byName),
    health,
    limit: 8,
  });

  return Response.json({
    deck: { id: deck.id, name: deck.name, commander: commanders.join(" & "), image: deck.commander_image_url, identity: deck.color_identity },
    health,
    label: healthLabel(health.score),
    edhrec: edh ? { numDecks: edh.numDecks, themes: edh.themes.slice(0, 5), avgLands: edh.types.land ?? null, slug: edh.slug } : null,
    swaps,
    // weitere gute Karten ohne direkten Tauschpartner
    more: adds.filter((a) => !swaps.some((s) => s.in.name === a.name)).slice(0, 12),
    sharing: friends.sharing,
  });
}
