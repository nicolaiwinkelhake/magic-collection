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
