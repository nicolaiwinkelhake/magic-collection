import { requireUser, unauthorized } from "@/lib/apiAuth";
import { fetchCardByName } from "@/lib/scryfall";
import { compactCard } from "@/lib/scryfallCache";
import { type CardMarks } from "@/lib/commanderLists";
import { loadCommanderLists } from "@/lib/commanderData";
import { edhrecLinks } from "@/lib/edhrecLinks";
import { findCombosWithCard } from "@/lib/commanderSpellbook";
import { selectAll } from "@/lib/supabase/selectAll";

export const maxDuration = 120;

const IN_CHUNK = 150;

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
  const marks = new Map<string, CardMarks>(names.map((n) => [n, { owned: 0, inDecks: [], friends: [], groupDecks: 0 }]));

  for (let i = 0; i < names.length; i += IN_CHUNK) {
    const chunk = names.slice(i, i + IN_CHUNK);
    const owned = await selectAll<{ name: string; quantity: number }>(() =>
      supabase.from("cards").select("name, quantity").eq("user_id", user.id).in("name", chunk).order("id")
    );
    for (const o of owned) marks.get(o.name)!.owned += o.quantity;

    // Join liefert je nach Schema-Erkennung ein Objekt oder ein Array.
    const inDecks = await selectAll<{ name: string; decks: { name: string } | { name: string }[] | null }>(() =>
      supabase.from("deck_cards").select("name, decks(name)").eq("user_id", user.id).in("name", chunk).order("id")
    );
    for (const d of inDecks) {
      const m = marks.get(d.name)!;
      const deckNames = Array.isArray(d.decks) ? d.decks.map((x) => x.name) : d.decks ? [d.decks.name] : [];
      for (const dn of deckNames) if (!m.inDecks.includes(dn)) m.inDecks.push(dn);
    }

    const { data: friends } = await supabase.rpc("friends_owning_cards", { p_names: chunk });
    for (const f of (friends ?? []) as Array<{ name: string; friend_email: string; quantity: number }>) {
      marks.get(f.name)?.friends.push({ friendEmail: f.friend_email, quantity: f.quantity });
    }

    const { data: group } = await supabase.rpc("group_card_counts", { p_names: chunk });
    for (const g of (group ?? []) as Array<{ name: string; decks: number }>) {
      const m = marks.get(g.name);
      if (m) m.groupDecks = g.decks;
    }
  }

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
