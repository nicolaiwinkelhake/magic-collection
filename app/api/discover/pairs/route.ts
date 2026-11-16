import { requireUser, unauthorized } from "@/lib/apiAuth";
import { getCardPairs } from "@/lib/edhrec";
import { loadMyDecks } from "@/lib/discoverData";
import { pairFit } from "@/lib/deckSynergy";

export const maxDuration = 30;

// Zusammenspiel Karte↔Karte: Mit welchen Karten des Decks wird jede der
// angefragten Karten laut EDHREC deutlich häufiger zusammen gespielt?
// ?deck=<id>&card=A&card=B (höchstens 4 Karten je Aufruf; gecacht 7 Tage)
export async function GET(req: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();
  const url = new URL(req.url);
  const deckId = url.searchParams.get("deck");
  const names = Array.from(new Set(url.searchParams.getAll("card").filter(Boolean))).slice(0, 4);
  if (!deckId || !names.length) return Response.json({ error: "deck und card fehlen" }, { status: 400 });
  const deck = (await loadMyDecks(supabase, user.id)).find((d) => d.id === deckId);
  if (!deck) return Response.json({ error: "Deck nicht gefunden" }, { status: 404 });

  const deckNames = deck.cards.filter((c) => !c.is_commander).map((c) => c.name);
  const result: Record<string, ReturnType<typeof pairFit>> = {};
  await Promise.all(
    names.map(async (n) => {
      const pairs = await getCardPairs(supabase, n);
      // die angefragten Karten selbst nicht als Partner zählen (Tausch-Paar)
      result[n] = pairFit(pairs, deckNames, names);
    }),
  );
  return Response.json({ cards: result, deckSize: deckNames.length });
}
