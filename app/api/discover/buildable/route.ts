import { requireUser, unauthorized } from "@/lib/apiAuth";
import { selectAll } from "@/lib/supabase/selectAll";
import { cachedCommanderSlugs, commanderSlug, getCommander, type EdhrecCommander } from "@/lib/edhrec";
import { loadFriendCards } from "@/lib/discoverData";

export const maxDuration = 60;

// Höchstens so viele noch unbekannte Commander je Aufruf bei EDHREC abfragen
// (kurz und höflich); der Client ruft erneut auf, solange pending > 0.
const FETCH_PER_CALL = 8;
const TOP = 100;

// "Neues Deck bauen": Welche Legenden meiner Sammlung kann ich am besten als
// Commander bauen? Bewertet nach EDHREC – wie viele der typischen Karten
// (gewichtet nach Anteil der Decks) ich schon besitze, und wie viele der
// fehlenden ein Freund hat.
export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();

  type Row = { name: string; type_line: string | null; oracle_text: string | null; image_url: string | null; colors: string[] | null };
  const mine = await selectAll<Row>(() =>
    supabase.from("cards").select("name, type_line, oracle_text, image_url, colors").eq("user_id", user.id).order("id"),
  );
  const ownedNames = new Set(mine.map((c) => c.name));
  const legends = Array.from(
    new Map(
      mine
        .filter((c) => /Legendary/.test(c.type_line ?? "") && (/Creature/.test(c.type_line ?? "") || /can be your commander/i.test(c.oracle_text ?? "")))
        .map((c) => [c.name, c]),
    ).values(),
  ).slice(0, 150);
  if (!legends.length) return Response.json({ commanders: [], pending: 0 });

  const { data: decks } = await supabase.from("decks").select("commander_name").eq("user_id", user.id);
  const withDeck = new Set((decks ?? []).map((d) => d.commander_name as string));
  const friends = await loadFriendCards(supabase);

  const cached = await cachedCommanderSlugs(supabase, legends.map((l) => commanderSlug([l.name])));
  let fetched = 0;
  const result = [];
  let pending = 0;
  for (const l of legends) {
    const slug = commanderSlug([l.name]);
    let page: EdhrecCommander | null = null;
    if (cached.has(slug)) page = await getCommander(supabase, [l.name], { cacheOnly: true });
    else if (fetched < FETCH_PER_CALL) {
      fetched += 1;
      page = await getCommander(supabase, [l.name]);
    } else {
      pending += 1;
      continue;
    }
    if (!page || !page.cards.length) continue;
    const top = page.cards
      .filter((c) => !/^(Plains|Island|Swamp|Mountain|Forest|Wastes)$/.test(c.name) && c.name !== l.name)
      .sort((a, b) => b.inclusion - a.inclusion)
      .slice(0, TOP);
    const total = top.reduce((s, c) => s + c.inclusion, 0) || 1;
    const have = top.filter((c) => ownedNames.has(c.name));
    const missing = top.filter((c) => !ownedNames.has(c.name));
    const fromFriends = missing.filter((c) => friends.byName.has(c.name));
    result.push({
      name: l.name,
      image: l.image_url,
      colors: l.colors ?? [],
      hasDeck: withDeck.has(l.name),
      numDecks: page.numDecks,
      themes: page.themes.slice(0, 3).map((t) => t.name),
      coverage: Math.round((have.reduce((s, c) => s + c.inclusion, 0) / total) * 1000) / 1000,
      owned: have.length,
      total: top.length,
      friends: fromFriends.length,
      topMissing: missing.slice(0, 5).map((c) => c.name),
    });
  }
  result.sort((a, b) => b.coverage - a.coverage);
  return Response.json({ commanders: result, pending });
}
