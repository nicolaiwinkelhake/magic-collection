// Sets-Seite: Sortierung nach Vollständigkeit und kommende Sets – rein, testbar.
import type { ScryfallSet } from "./scryfall";

export type SetProgress = { code: string; owned: number; total: number; released: string };

export const percent = (r: { owned: number; total: number }) => (r.total > 0 ? (r.owned / r.total) * 100 : 0);

/** Höchster Prozentwert oben; bei Gleichstand mehr Karten, dann neueres Set. Sets ohne bekannte Größe ans Ende. */
export function sortByPercent<T extends SetProgress>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if ((a.total > 0) !== (b.total > 0)) return a.total > 0 ? -1 : 1;
    return percent(b) - percent(a) || b.owned - a.owned || (b.released > a.released ? 1 : b.released < a.released ? -1 : 0);
  });
}

// Für Sammler interessante Set-Arten (ohne Token, Promos, Online-Sets …)
const UPCOMING_TYPES: Record<string, string> = {
  expansion: "Erweiterung",
  core: "Hauptset",
  masters: "Masters",
  draft_innovation: "Draft-Set",
  commander: "Commander",
  funny: "Spaß-Set",
  starter: "Einsteiger",
  box: "Box-Set",
  duel_deck: "Duel Deck",
  from_the_vault: "From the Vault",
  premium_deck: "Premium Deck",
  planechase: "Planechase",
  archenemy: "Archenemy",
};

export type UpcomingSet = {
  code: string;
  name: string;
  released: string;
  type: string;
  icon: string | null;
  url: string | null;
  spoiled: number;
  daysLeft: number;
  /** zugehörige Sets (z. B. Commander-Decks zum Hauptset) */
  related: Array<{ code: string; name: string; type: string }>;
};

/** Kommende Sets ab morgen, nach Datum; Neben-Sets (Commander …) beim Hauptset gebündelt. */
export function upcomingSets(all: ScryfallSet[], today = new Date().toISOString().slice(0, 10)): UpcomingSet[] {
  const future = all.filter((s) => s.released_at > today && s.set_type in UPCOMING_TYPES);
  const codes = new Set(future.map((s) => s.code));
  const day = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  const main = future.filter((s) => !s.parent_set_code || !codes.has(s.parent_set_code));
  return main
    .map((s) => ({
      code: s.code,
      name: s.name,
      released: s.released_at,
      type: UPCOMING_TYPES[s.set_type],
      icon: s.icon_svg_uri,
      url: s.scryfall_uri,
      spoiled: s.card_count,
      daysLeft: Math.round((day(s.released_at) - day(today)) / 86_400_000),
      related: future
        .filter((c) => c.parent_set_code === s.code)
        .map((c) => ({ code: c.code, name: c.name, type: UPCOMING_TYPES[c.set_type] })),
    }))
    .sort((a, b) => (a.released < b.released ? -1 : a.released > b.released ? 1 : a.name.localeCompare(b.name)));
}

export type SetValueCard = { set_code: string | null; scryfall_id: string; quantity: number; foil: boolean; price_eur: number | null; price_eur_foil?: number | null };
export type SetMove = { code: string; delta: number; percent: number };

/**
 * Wertänderung je Set (dieselben Exemplare, nur durch Preise) gegenüber den
 * Preisen am Stichtag; dazu das Set mit dem größten Zuwachs und das mit dem
 * größten Verlust in Euro. Karten ohne Ausgangspreis zählen nicht (rein).
 */
export function setValueMoves(
  cards: SetValueCard[],
  baseline: Record<string, [number | null, number | null]>,
): { bySet: Map<string, SetMove>; up: SetMove | null; down: SetMove | null } {
  const acc = new Map<string, { before: number; now: number }>();
  for (const c of cards) {
    if (!c.set_code || c.quantity <= 0) continue;
    const b = baseline[c.scryfall_id];
    if (!b) continue;
    const before = c.foil ? b[1] ?? b[0] : b[0];
    const now = c.foil ? c.price_eur_foil ?? c.price_eur : c.price_eur;
    if (before == null || now == null) continue;
    const a = acc.get(c.set_code) ?? { before: 0, now: 0 };
    a.before += before * c.quantity;
    a.now += now * c.quantity;
    acc.set(c.set_code, a);
  }
  const bySet = new Map<string, SetMove>();
  for (const [code, a] of acc) {
    const delta = Math.round((a.now - a.before) * 100) / 100;
    bySet.set(code, { code, delta, percent: a.before > 0 ? ((a.now - a.before) / a.before) * 100 : 0 });
  }
  let up: SetMove | null = null;
  let down: SetMove | null = null;
  for (const m of bySet.values()) {
    if (m.delta > 0 && (!up || m.delta > up.delta)) up = m;
    if (m.delta < 0 && (!down || m.delta < down.delta)) down = m;
  }
  return { bySet, up, down };
}
