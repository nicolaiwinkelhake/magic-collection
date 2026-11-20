import { requireUser, unauthorized } from "@/lib/apiAuth";
import { fetchCardByName } from "@/lib/scryfall";
import { compactCard, type CompactCard } from "@/lib/scryfallCache";
import { loadCardMarks } from "@/lib/cardMarks";
import { edhrecLinks } from "@/lib/edhrecLinks";
import { getCommanderPage, normalizeSub } from "@/lib/edhrecPage";
import { resolveCards } from "@/lib/resolveCards";
import { findCombosWithCard } from "@/lib/commanderSpellbook";
import { unionIdentity } from "@/lib/colorIdentity";

export const maxDuration = 60;

// GET /api/commanders/edhrec?name=...&partner=...&sub=...
// Commander-Seite im Aufbau von EDHREC: Kartenlisten mit Anteil und Synergie,
// Kurve, Typen, Themen – dazu Bilder/Preise aus dem eigenen Katalog und die
// Markierungen (Besitz, Decks, Freunde, Gruppe). `sub`: Thema, "budget" oder "expensive".
// 404 mit code "no_edhrec", wenn EDHREC den Commander nicht kennt – dann zeigt
// der Client die Scryfall-Ansicht (/api/commanders/overview).
export async function GET(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();

  const url = new URL(request.url);
  const name = url.searchParams.get("name")?.trim();
  const partnerName = url.searchParams.get("partner")?.trim() || null;
  const sub = normalizeSub(url.searchParams.get("sub"));
  if (!name) return Response.json({ error: "Commander-Name fehlt" }, { status: 400 });

  const main = await fetchCardByName(name);
  if (!main.card) return Response.json({ error: `Commander „${name}“ nicht gefunden` }, { status: 404 });
  const partner = partnerName ? await fetchCardByName(partnerName) : null;
  if (partnerName && !partner?.card) {
    return Response.json({ error: `Partner „${partnerName}“ nicht gefunden` }, { status: 404 });
  }
  const commanders = [main.card, ...(partner?.card ? [partner.card] : [])];
  const commanderNames = commanders.map((c) => c.name);

  const page = await getCommanderPage(supabase, commanderNames, sub);
  if (!page) {
    return Response.json(
      { error: sub ? "Dazu gibt es bei EDHREC keine Seite." : "EDHREC kennt diesen Commander nicht (oder ist gerade nicht erreichbar).", code: "no_edhrec" },
      { status: 404 },
    );
  }

  // Combos nur auf der Hauptseite – auf Unterseiten behält der Client die vorhandenen.
  const combos = sub ? [] : await findCombosWithCard(main.card.name, 12);

  // Karten der Listen auflösen: erst eigener Katalog, nur der Rest bei Scryfall.
  const edhrecNames = Array.from(new Set(page.sections.flatMap((s) => s.cards.map((c) => c.name))));
  let resolved = new Map<number, ReturnType<typeof compactCard>>();
  try {
    const cards = await resolveCards(edhrecNames.map((n, i) => ({ i, name: n })));
    resolved = new Map(Array.from(cards, ([i, c]) => [i, compactCard(c as never)]));
  } catch {
    // Scryfall nicht erreichbar → Karten ohne Bild/Preis zeigen, nicht abbrechen
  }
  const byEdhrecName = new Map<string, CompactCard>(edhrecNames.flatMap((n, i) => (resolved.has(i) ? [[n, resolved.get(i)!] as const] : [])));

  const markNames = Array.from(
    new Set([...edhrecNames.map((n) => byEdhrecName.get(n)?.name ?? n), ...combos.flatMap((c) => c.cards)]),
  );
  const marks = await loadCardMarks(supabase, user.id, markNames);

  const identity = unionIdentity(commanders.map((c) => c.color_identity ?? c.colors ?? []));
  const raw = main.card as unknown as { edhrec_rank?: number };

  return Response.json({
    commander: {
      ...compactCard(main.card as never),
      oracleText: main.card.oracle_text ?? "",
      rank: page.rank ?? raw.edhrec_rank ?? null,
      partner: partner?.card ? { ...compactCard(partner.card as never), oracleText: partner.card.oracle_text ?? "" } : null,
      identity,
    },
    links: edhrecLinks(main.card.name, partner?.card?.name),
    themes: [],
    lists: page.sections.map((s) => ({
      key: s.key,
      label: s.label,
      cards: s.cards.map((c) => {
        const card = byEdhrecName.get(c.name);
        const base: CompactCard = card ?? {
          id: `edhrec:${c.name}`,
          name: c.name,
          image: null,
          manaCost: null,
          cmc: 0,
          typeLine: "",
          colorIdentity: [],
          eur: null,
          eurFoil: null,
          edhrecRank: null,
          gameChanger: false,
          releasedAt: null,
        };
        return { ...base, ...marks.get(base.name)!, inclusion: c.inclusion, synergy: c.synergy };
      }),
    })),
    combos: combos.map((c) => ({
      ...c,
      missing: c.cards.filter((n) => !commanderNames.includes(n) && (marks.get(n)?.owned ?? 0) === 0),
    })),
    edhrec: {
      sub: page.sub,
      numDecks: page.numDecks,
      salt: page.salt,
      curve: page.curve,
      types: page.types,
      brackets: page.brackets,
      budget: page.budget,
      themes: page.themes,
      similar: page.similar,
    },
  });
}
