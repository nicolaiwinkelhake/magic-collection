// Preisentwicklung der Sammlung in Prozent.
//
// Bewusst NICHT aus dem Gesamtwert-Verlauf berechnet: Wer neue Karten
// hinzufügt, steigert den Gesamtwert, ohne dass etwas "gewonnen" wurde.
// Stattdessen: dieselben Karten (gleicher Druck, gleiche Menge) heute
// gegenüber ihrem Preis vor N Tagen. Karten ohne Preis an diesem Tag
// (z. B. Drucke, die erst seit Kurzem im Preisverlauf stehen) zählen nicht mit.

import { basePrice, conditionFactor, type ValuableCard } from "./valuation";

export const PERIODS = [
  { days: 1, label: "seit gestern" },
  { days: 7, label: "7 Tage" },
  { days: 30, label: "30 Tage" },
] as const;
export type PeriodDays = (typeof PERIODS)[number]["days"];

/** Preis je Scryfall-ID an einem früheren Tag: [Normal, Foil]. */
export type Baseline = Record<string, [number | null, number | null]>;

export type PriceChange = {
  percent: number;
  /** Euro-Differenz der verglichenen Karten. */
  delta: number;
  /** Wie viele Einträge verglichen werden konnten. */
  matched: number;
  total: number;
};

type Card = ValuableCard & { scryfall_id?: string | null };

export function priceChange(cards: Card[], baseline: Baseline | undefined): PriceChange | null {
  if (!baseline) return null;
  let past = 0;
  let now = 0;
  let matched = 0;
  for (const c of cards) {
    const b = c.scryfall_id ? baseline[c.scryfall_id] : undefined;
    if (!b) continue;
    const old = c.foil ? b[1] ?? b[0] : b[0];
    if (old == null) continue;
    const factor = conditionFactor(c.condition) * c.quantity;
    past += old * factor;
    now += basePrice(c) * factor;
    matched++;
  }
  // Zu wenig Grundlage → lieber nichts anzeigen als eine Zufallszahl.
  if (matched === 0 || past < 0.5) return null;
  const delta = Math.round((now - past) * 100) / 100;
  return { percent: ((now - past) / past) * 100, delta, matched, total: cards.length };
}

/** "+3,2 %", "−0,4 %", "±0 %" */
export function formatPercent(p: number): string {
  const r = Math.round(p * 10) / 10;
  if (r === 0) return "±0 %";
  const s = Math.abs(r).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${r > 0 ? "+" : "−"}${s} %`;
}

/** Datum (UTC, wie die Tages-Snapshots in der Datenbank) vor `days` Tagen. */
export function dayString(days: number, now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days));
  return d.toISOString().slice(0, 10);
}

/** Zeiträume auf der Seite „Wertverlauf“ */
export const STATS_RANGES = [
  { key: "1d", label: "1 Tag", days: 1 },
  { key: "1w", label: "1 Woche", days: 7 },
  { key: "1m", label: "1 Monat", days: 30 },
  { key: "1y", label: "1 Jahr", days: 365 },
  { key: "3y", label: "3 Jahre", days: 1095 },
] as const;
export type StatsRangeKey = (typeof STATS_RANGES)[number]["key"];

export type MoverCard = Card & { name: string; set_code?: string | null; image_url?: string | null };
export type Mover<T extends MoverCard = MoverCard> = {
  /** ein Sammlungseintrag dieses Drucks (zum Öffnen des Kartendetails) */
  card: T;
  name: string;
  scryfall_id: string;
  foil: boolean;
  set_code: string | null;
  image_url: string | null;
  quantity: number;
  /** Preis je Exemplar damals/heute (Marktpreis, ohne Zustand) */
  before: number;
  now: number;
  /** Euro-Änderung je Exemplar (Marktpreis heute − damals) */
  delta: number;
  percent: number;
};

/**
 * Größte Gewinner und Verlierer: je Druck (+ Foil) der Marktpreis heute
 * gegenüber dem Preis zu Beginn des Zeitraums – je Exemplar, unabhängig von
 * der Menge. Sortiert nach Euro-Änderung; unveränderte Karten fehlen (rein).
 */
export function topMovers<T extends MoverCard>(cards: T[], baseline: Baseline | undefined, limit = 5): { gainers: Mover<T>[]; losers: Mover<T>[] } {
  if (!baseline) return { gainers: [], losers: [] };
  const byPrint = new Map<string, Mover<T>>();
  for (const c of cards) {
    if (!c.scryfall_id || c.quantity <= 0) continue;
    const b = baseline[c.scryfall_id];
    if (!b) continue;
    const before = c.foil ? b[1] ?? b[0] : b[0];
    const now = basePrice(c);
    if (before == null || !before || !now) continue;
    const key = `${c.scryfall_id}|${c.foil ? 1 : 0}`;
    const m = byPrint.get(key) ?? {
      card: c,
      name: c.name,
      scryfall_id: c.scryfall_id,
      foil: !!c.foil,
      set_code: c.set_code ?? null,
      image_url: c.image_url ?? null,
      quantity: 0,
      before,
      now,
      delta: now - before,
      percent: ((now - before) / before) * 100,
    };
    m.quantity += c.quantity;
    byPrint.set(key, m);
  }
  const all = Array.from(byPrint.values()).map((m) => ({ ...m, delta: Math.round(m.delta * 100) / 100 }));
  return {
    gainers: all.filter((m) => m.delta > 0).sort((a, b) => b.delta - a.delta || b.percent - a.percent).slice(0, limit),
    losers: all.filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta || a.percent - b.percent).slice(0, limit),
  };
}
