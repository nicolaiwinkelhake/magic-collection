import { requireUser, unauthorized } from "@/lib/apiAuth";
import { getCommander } from "@/lib/edhrec";
import { commandersOf, loadFriendCards, loadMyCards, loadMyDecks, ownership } from "@/lib/discoverData";

export const maxDuration = 60;

// "Bei Freunden": Welche Karten aus den geteilten Sammlungen meiner Freunde
// passen in meine Decks? Grundlage ist die EDHREC-Statistik je Commander
// (Anteil der Decks + Synergie). Karten, die ich selbst frei habe oder die
// schon im Deck sind, fallen raus.
export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();
  const [decks, friends, myCards] = await Promise.all([loadMyDecks(supabase, user.id), loadFriendCards(supabase), loadMyCards(supabase, user.id)]);
  if (!friends.sharing) return Response.json({ sharing: 0, decks: [] });
  const own = ownership(myCards, decks);

  const out = [];
  for (const deck of decks) {
    const edh = await getCommander(supabase, commandersOf(deck));
    if (!edh) continue;
    const inDeck = new Set(deck.cards.map((c) => c.name));
    const items = edh.cards
      .filter((e) => !inDeck.has(e.name) && friends.byName.has(e.name) && !(own.get(e.name)?.free))
      .map((e) => {
        const why = [`in ${Math.round(e.inclusion * 100)} % der Decks`];
        if (e.synergy >= 0.1) why.push(`Synergie +${Math.round(e.synergy * 100)} %`);
        return {
          name: e.name,
          inclusion: e.inclusion,
          synergy: e.synergy,
          reason: why.join(" · "),
          score: e.inclusion * 1.2 + Math.max(0, e.synergy) * 0.8,
          friends: friends.byName.get(e.name)!,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
    if (items.length) {
      out.push({
        deck: { id: deck.id, name: deck.name, commander: commandersOf(deck).join(" & "), image: deck.commander_image_url },
        items,
      });
    }
  }
  return Response.json({ sharing: friends.sharing, decks: out });
}
