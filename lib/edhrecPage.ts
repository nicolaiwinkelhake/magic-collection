// Komplette EDHREC-Commander-Seite (Aufbau wie auf edhrec.com): alle Kartenlisten
// mit Anteil und Synergie, Mana-Kurve, Kartentypen, Brackets, Themen und
// ähnliche Commander. Gecacht wie alle EDHREC-Seiten (7 Tage, scryfall_cache).
// Die schlanke Variante für Empfehlungen und Deck-Vergleiche steht in edhrec.ts.
import type { SupabaseClient } from "@supabase/supabase-js";
import { cachedPage, commanderSlug, edhrecSlug, type RawPage } from "@/lib/edhrec";

export type PageCard = {
  name: string;
  /** Anteil der Decks, die die Karte spielen (0–1) */
  inclusion: number;
  /** Synergie in Anteilspunkten (−1…1); 0,27 = „+27 %“ */
  synergy: number;
};

export type PageSection = { key: string; label: string; cards: PageCard[] };

export type CommanderPage = {
  slug: string;
  /** Unterseite: Thema (z. B. "infect"), "budget" oder "expensive"; sonst "" */
  sub: string;
  numDecks: number;
  /** Platz unter allen Commandern (EDHREC) */
  rank: number | null;
  /** Salzigkeit 0–4 (EDHREC „Salt“) */
  salt: number | null;
  /** Karten je Manawert 0…7+ (Nicht-Länder, Durchschnittsdeck) */
  curve: number[];
  /** Durchschnitt je Kartentyp im Deck */
  types: Array<{ key: string; label: string; value: number }>;
  /** Decks je Bracket 1–5 */
  brackets: number[];
  /** Decks je Preisklasse */
  budget: { budget: number; middle: number; expensive: number } | null;
  themes: Array<{ slug: string; name: string; count: number }>;
  similar: string[];
  sections: PageSection[];
};

const LABELS: Record<string, string> = {
  newcards: "Neue Karten",
  highsynergycards: "Hohe Synergie",
  topcards: "Top-Karten",
  highliftcards: "Geheimtipps",
  gamechangers: "Game Changer",
  creatures: "Kreaturen",
  instants: "Spontanzauber",
  sorceries: "Hexereien",
  utilityartifacts: "Nützliche Artefakte",
  enchantments: "Verzauberungen",
  planeswalkers: "Planeswalker",
  battles: "Schlachten",
  utilitylands: "Nützliche Länder",
  manaartifacts: "Mana-Artefakte",
  lands: "Länder",
};

const TYPE_LABELS: Record<string, string> = {
  creature: "Kreaturen",
  instant: "Spontanzauber",
  sorcery: "Hexereien",
  artifact: "Artefakte",
  enchantment: "Verzauberungen",
  planeswalker: "Planeswalker",
  battle: "Schlachten",
  land: "Länder",
};

// Grundländer sind keine Empfehlung – sie stehen bei EDHREC nur der Vollständigkeit halber in "Länder".
const BASICS = /^(Snow-Covered )?(Plains|Island|Swamp|Mountain|Forest|Wastes)$/;

/** Mindestanteil, ab dem eine Karte als „hohe Synergie“ gilt (sonst stünden Exoten ganz oben). */
const HIGH_SYNERGY_MIN_INCLUSION = 0.1;
const HIGH_SYNERGY_COUNT = 12;

type RawView = { name?: string; synergy?: number; num_decks?: number; potential_decks?: number };
type RawFull = {
  container?: { json_dict?: { card?: { num_decks?: number; rank?: number; salt?: number }; cardlists?: Array<{ tag?: string; header?: string; cardviews?: RawView[] }> } };
  panels?: {
    mana_curve?: Record<string, number>;
    taglinks?: Array<{ slug: string; value: string; count: number }>;
  };
  bracket_counts?: Record<string, number>;
  budget_counts?: { budget?: number; middle?: number; expensive?: number };
  similar?: Array<string | { name?: string }>;
  tag_counts?: Array<{ slug: string; value: string; count: number }>;
  [type: string]: unknown;
};

const round = (n: number, f: number) => Math.round(n * f) / f;

/** Rohe EDHREC-Seite → kompakte Seite (rein, getestet). */
export function compactFullPage(raw: RawPage, slug: string, sub = ""): CommanderPage {
  const r = raw as unknown as RawFull;
  const dict = r.container?.json_dict ?? {};

  const sections: PageSection[] = [];
  for (const list of dict.cardlists ?? []) {
    const key = list.tag ?? "";
    if (!key) continue;
    const cards: PageCard[] = [];
    const seen = new Set<string>();
    for (const v of list.cardviews ?? []) {
      if (!v?.name || seen.has(v.name)) continue;
      if (key === "lands" && BASICS.test(v.name)) continue;
      seen.add(v.name);
      cards.push({
        name: v.name,
        inclusion: v.potential_decks ? round((v.num_decks ?? 0) / v.potential_decks, 1000) : 0,
        synergy: round(v.synergy ?? 0, 1000),
      });
    }
    if (cards.length) sections.push({ key, label: LABELS[key] ?? list.header ?? key, cards });
  }

  // Hohe Synergie: gibt es bei manchen Commandern nicht als eigene Liste → aus allen Karten ableiten.
  if (!sections.some((s) => s.key === "highsynergycards")) {
    const best = new Map<string, PageCard>();
    for (const s of sections) {
      if (s.key === "newcards" || s.key === "lands") continue;
      for (const c of s.cards) if (c.inclusion >= HIGH_SYNERGY_MIN_INCLUSION && c.synergy > 0 && !best.has(c.name)) best.set(c.name, c);
    }
    const top = Array.from(best.values())
      .sort((a, b) => b.synergy - a.synergy)
      .slice(0, HIGH_SYNERGY_COUNT);
    if (top.length) {
      const at = sections.findIndex((s) => s.key === "newcards") + 1;
      sections.splice(at, 0, { key: "highsynergycards", label: LABELS.highsynergycards, cards: top });
    }
  }

  const curveRaw = r.panels?.mana_curve ?? {};
  const curve = Array.from({ length: 8 }, () => 0);
  for (const [k, v] of Object.entries(curveRaw)) curve[Math.min(7, Math.max(0, Number(k) || 0))] += v;

  const types = Object.keys(TYPE_LABELS)
    .map((key) => ({ key, label: TYPE_LABELS[key], value: typeof raw[key] === "number" ? (raw[key] as number) : 0 }))
    .filter((t) => t.value > 0);

  const bc = r.bracket_counts ?? {};
  const bg = r.budget_counts;

  return {
    slug,
    sub,
    numDecks: dict.card?.num_decks ?? 0,
    rank: dict.card?.rank ?? null,
    salt: typeof dict.card?.salt === "number" ? round(dict.card.salt, 10) : null,
    curve,
    types,
    brackets: [1, 2, 3, 4, 5].map((b) => bc[String(b)] ?? 0),
    budget: bg ? { budget: bg.budget ?? 0, middle: bg.middle ?? 0, expensive: bg.expensive ?? 0 } : null,
    themes: [...(r.panels?.taglinks ?? r.tag_counts?.map((t) => ({ slug: t.slug, value: t.value, count: t.count })) ?? [])]
      .sort((a, b) => b.count - a.count)
      .slice(0, 16)
      .map((t) => ({ slug: t.slug, name: t.value, count: t.count })),
    similar: (r.similar ?? [])
      .map((s) => (typeof s === "string" ? s : s?.name ?? ""))
      .filter(Boolean)
      .slice(0, 8),
    sections,
  };
}

/** Erlaubte Unterseiten: Preisklasse oder ein Thema-Name (wird zum EDHREC-Namen). */
export function normalizeSub(sub: string | null | undefined): string {
  const s = (sub ?? "").trim().toLowerCase();
  if (s === "budget" || s === "expensive") return s;
  return edhrecSlug(s);
}

/** EDHREC-Seite eines Commanders (oder Paars) samt Unterseite. null = EDHREC kennt ihn nicht / nicht erreichbar. */
export async function getCommanderPage(
  supabase: SupabaseClient,
  commanderNames: string[],
  sub = "",
): Promise<CommanderPage | null> {
  const slug = commanderSlug(commanderNames);
  if (!slug) return null;
  const s = normalizeSub(sub);
  const path = s ? `${slug}/${s}` : slug;
  return cachedPage(supabase, `edhrec:page:v1:${path}`, `commanders/${path}`, (raw) => compactFullPage(raw, slug, s));
}
