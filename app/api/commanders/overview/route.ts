import { requireUser, unauthorized } from "@/lib/apiAuth";
import { fetchCardByName } from "@/lib/scryfall";
import { compactCard } from "@/lib/scryfallCache";
import { loadCardMarks } from "@/lib/cardMarks";
import { loadCommanderLists } from "@/lib/commanderData";
import { edhrecLinks } from "@/lib/edhrecLinks";
import { findCombosWithCard } from "@/lib/commanderSpellbook";

export const maxDuration = 120;

// GET /api/commanders/overview?name=...&partner=...
// Liefert alles für die Commander-Seite: Commander-Daten, Themen, Kartenlisten
// (Scryfall, gecacht) mit Besitz/Deck/Freunde/Gruppe-Markierungen und Combos.
export async function GET(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();

  const url = new URL(request.url);
  const name = url.searchParams.get("name")?.trim();
  const partnerName = url.searchParams.get("partner")?.trim() || null;
  if (!name) return Response.json({ error: "Commander-Name fehlt" }, { status: 400 });

  const main = await fetchCardByName(name);
  if (!main.card) return Response.json({ error: `Commander „${name}“ nicht gefunden` }, { status: 404 });
  const partner = partnerName ? await fetchCardByName(partnerName) : null;
  if (partnerName && !partner?.card) {
    return Response.json({ error: `Partner „${partnerName}“ nicht gefunden` }, { status: 404 });
  }

  const commanders = [main.card, ...(partner?.card ? [partner.card] : [])];
  const commanderNames = commanders.map((c) => c.name);
  const { identity, themes, lists } = await loadCommanderLists(supabase, commanders);

  // Combos mit dem (Haupt-)Commander.
  const combos = await findCombosWithCard(main.card.name, 12);

  // Markierungen: eigene Sammlung, eigene Decks, Freunde, Gruppe.
  const names = Array.from(
    new Set([...lists.flatMap((l) => l.cards.map((c) => c.name)), ...combos.flatMap((c) => c.cards)])
  );
  const marks = await loadCardMarks(supabase, user.id, names);

  const raw = main.card as unknown as { edhrec_rank?: number; game_changer?: boolean };
  return Response.json({
    commander: {
      ...compactCard(main.card as never),
      oracleText: main.card.oracle_text ?? "",
      rank: raw.edhrec_rank ?? null,
      partner: partner?.card ? { ...compactCard(partner.card as never), oracleText: partner.card.oracle_text ?? "" } : null,
      identity,
    },
    links: edhrecLinks(main.card.name, partner?.card?.name),
    themes,
    lists: lists.map((l) => ({ ...l, cards: l.cards.map((c) => ({ ...c, ...marks.get(c.name)! })) })),
    combos: combos.map((c) => ({
      ...c,
      missing: c.cards.filter((n) => !commanderNames.includes(n) && (marks.get(n)?.owned ?? 0) === 0),
    })),
  });
}
