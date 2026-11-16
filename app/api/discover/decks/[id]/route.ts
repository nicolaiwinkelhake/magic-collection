import { requireUser, unauthorized } from "@/lib/apiAuth";
import { getCommander, type EdhrecCommander } from "@/lib/edhrec";
import { availabilityFor, commandersOf, loadCardInfo, loadFriendCards, loadMyCards, loadMyDecks, loadRoles, ownership } from "@/lib/discoverData";
import { deckHealth, healthLabel, planSwaps } from "@/lib/deckDoctor";
import { deckSynergy, pickStrategy, strategyFit, type StrategyFit } from "@/lib/deckSynergy";

export const maxDuration = 60;

/** So viele Themen des Commanders werden als Strategie geprüft */
const THEMES_CHECKED = 4;

// Deck-Check für ein Deck: Gesundheit, Stimmigkeit (Synergie) und konkrete
// Tausche ("raus X → rein Y") auf Basis der EDHREC-Statistik des Commanders –
// passend zur Strategie des Decks (automatisch erkannt oder gewählt, ?theme=).
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();
  const decks = await loadMyDecks(supabase, user.id);
  const deck = decks.find((d) => d.id === params.id);
  if (!deck) return Response.json({ error: "Deck nicht gefunden" }, { status: 404 });
  const wanted = new URL(req.url).searchParams.get("theme"); // null = automatisch, "" = allgemein

  const commanders = commandersOf(deck);
  const [base, myCards, friends] = await Promise.all([getCommander(supabase, commanders), loadMyCards(supabase, user.id), loadFriendCards(supabase)]);
  const own = ownership(myCards, decks);

  // Strategien: allgemeine Statistik + die häufigsten Themen des Commanders
  const pages = new Map<string, EdhrecCommander>();
  const fits: StrategyFit[] = [];
  if (base) {
    pages.set("", base);
    fits.push({ slug: "", name: "Allgemein", fit: strategyFit(deck.cards, base.cards), numDecks: base.numDecks });
    const themed = await Promise.all(
      base.themes.slice(0, THEMES_CHECKED).map(async (t) => ({ t, page: await getCommander(supabase, commanders, { theme: t.slug }) })),
    );
    for (const { t, page } of themed) {
      if (!page || !page.cards.length) continue;
      pages.set(t.slug, page);
      fits.push({ slug: t.slug, name: t.name, fit: strategyFit(deck.cards, page.cards), numDecks: page.numDecks });
    }
  }
  const auto = pickStrategy(fits);
  const chosen = wanted !== null && pages.has(wanted) ? fits.find((f) => f.slug === wanted)! : auto;
  const edh = chosen ? pages.get(chosen.slug)! : null;

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
  const themeNames = (base?.themes ?? []).map((t) => t.name);
  const { swaps, adds } = planSwaps({
    deck: deck.cards,
    identity: deck.color_identity,
    commanderNames: commanders,
    edhrec: edh?.cards ?? [],
    roles,
    info,
    availability: availabilityFor(candNames, own, friends.byName),
    health,
    themes: themeNames,
    limit: 8,
  });

  return Response.json({
    deck: { id: deck.id, name: deck.name, commander: commanders.join(" & "), image: deck.commander_image_url, identity: deck.color_identity },
    health,
    label: healthLabel(health.score),
    edhrec: edh && base ? { numDecks: edh.numDecks, themes: base.themes.slice(0, 5), avgLands: edh.types.land ?? null, slug: base.slug } : null,
    strategy: chosen ? { slug: chosen.slug, name: chosen.name, auto: chosen.slug === auto?.slug && wanted === null, autoSlug: auto?.slug ?? "" } : null,
    strategies: fits,
    synergy: edh ? deckSynergy(deck.cards, edh.cards, themeNames.slice(0, 5)) : null,
    swaps,
    // weitere gute Karten ohne direkten Tauschpartner
    more: adds.filter((a) => !swaps.some((s) => s.in.name === a.name)).slice(0, 12),
    sharing: friends.sharing,
  });
}
