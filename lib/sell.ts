// Extern verkaufen: Preisvorschläge und Anzeigentexte – rein und testbar.
//
// Preisgrundlage ist der Cardmarket-Trendpreis des genauen Drucks (über
// Scryfall), Foil getrennt, zustandsbereinigt. Den Endpreis legt der Nutzer
// selbst fest; hier entstehen nur marktübliche Vorschläge.

import { conditionFactor } from "./valuation";

export type SellCard = {
  name: string;
  set_code: string | null;
  collector_number: string | null;
  foil: boolean;
  condition?: string | null;
  language?: string | null;
  price_eur: number | null;
  price_eur_foil: number | null;
};

export type SellItem = { card: SellCard; quantity: number; price: number | null };

export const CONDITIONS: Array<{ code: string; label: string }> = [
  { code: "NM", label: "Near Mint" },
  { code: "LP", label: "Lightly Played" },
  { code: "MP", label: "Moderately Played" },
  { code: "HP", label: "Heavily Played" },
  { code: "DMG", label: "Damaged" },
];

const LANG: Record<string, string> = { EN: "Englisch", DE: "Deutsch", FR: "Französisch", IT: "Italienisch", ES: "Spanisch", JA: "Japanisch" };

export function languageLabel(code?: string | null): string {
  return LANG[(code ?? "EN").toUpperCase()] ?? (code ?? "EN").toUpperCase();
}

export function conditionLabel(code?: string | null): string {
  const c = (code ?? "NM").toUpperCase();
  return CONDITIONS.find((x) => x.code === c)?.label ?? c;
}

/** Marktpreis eines Exemplars: Trendpreis des Drucks (Foil getrennt) × Zustand. */
export function marketPrice(card: SellCard): number | null {
  const base = card.foil ? card.price_eur_foil ?? card.price_eur : card.price_eur;
  if (base == null) return null;
  return Math.round(base * conditionFactor(card.condition) * 100) / 100;
}

/**
 * Vorschlag für Cardmarket: Trendpreis, zustandsbereinigt, mindestens 0,02 €
 * (kleinster Cardmarket-Preis).
 */
export function cardmarketSuggestion(card: SellCard): number | null {
  const p = marketPrice(card);
  return p == null ? null : Math.max(0.02, p);
}

/**
 * Vorschlag für eine Kleinanzeigen-Anzeige (Sammelangebot): Privatverkäufe
 * liegen üblich etwa 10 % unter Cardmarket (keine Gebühren, kein Käuferschutz,
 * Bündel-Rabatt). Ab 10 € auf 5 € abgerundet, darunter auf ganze Euro, mind. 1 €.
 */
export function bundleSuggestion(marketTotal: number): number {
  if (!(marketTotal > 0)) return 0;
  const p = marketTotal * 0.9;
  if (p >= 10) return Math.floor(p / 5) * 5;
  return Math.max(1, Math.floor(p));
}

/** Summe der Marktpreise (je Exemplar × Menge). */
export function marketTotal(items: Array<{ card: SellCard; quantity: number }>): number {
  return Math.round(items.reduce((s, i) => s + (marketPrice(i.card) ?? 0) * i.quantity, 0) * 100) / 100;
}

const eur = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

function printLabel(c: SellCard): string {
  const parts = [c.set_code?.toUpperCase(), c.collector_number ? `#${c.collector_number}` : null].filter(Boolean);
  return parts.join(" ");
}

/** Eine Zeile je Karte, z. B. "1× Sol Ring (C13 #259) – Foil – Near Mint – Englisch" */
export function itemLine(i: { card: SellCard; quantity: number }): string {
  const c = i.card;
  const print = printLabel(c);
  return [
    `${i.quantity}× ${c.name}${print ? ` (${print})` : ""}`,
    c.foil ? "Foil" : null,
    conditionLabel(c.condition),
    languageLabel(c.language),
  ]
    .filter(Boolean)
    .join(" – ");
}

/** Liste für Cardmarket (Text zum Abhaken beim Einstellen). */
export function cardmarketListText(items: SellItem[]): string {
  return items
    .map((i) => `${itemLine(i)}${i.price != null ? ` – ${eur(i.price)}` : ""}`)
    .join("\n");
}

/** Titel + Beschreibung für eine Kleinanzeigen-Anzeige. */
export function adText(listing: string, items: Array<{ card: SellCard; quantity: number }>, askingPrice: number | null) {
  const count = items.reduce((s, i) => s + i.quantity, 0);
  const title = `Magic: The Gathering – ${listing} (${count} ${count === 1 ? "Karte" : "Karten"})`.slice(0, 65);
  const lines = items.map((i) => `• ${itemLine(i)}`);
  const description = [
    `Verkaufe Magic: The Gathering Karten – ${listing}.`,
    "",
    ...lines,
    "",
    `Insgesamt ${count} ${count === 1 ? "Karte" : "Karten"}.${askingPrice != null ? ` Preis für alles: ${eur(askingPrice)} VB.` : ""}`,
    "Zustand wie angegeben, Fotos zeigen die Karten. Versand oder Abholung möglich.",
    "Privatverkauf – keine Garantie, keine Rücknahme.",
  ].join("\n");
  return { title, description };
}

/**
 * Erlös einer verkauften Anzeige auf die Karten verteilen – anteilig zum
 * Marktpreis (für die Verkaufshistorie). Summe ergibt exakt den Erlös.
 */
export function splitRevenue(total: number, items: Array<{ card: SellCard; quantity: number }>): number[] {
  const weights = items.map((i) => Math.max(marketPrice(i.card) ?? 0, 0.01) * i.quantity);
  const sum = weights.reduce((a, b) => a + b, 0);
  const cents = Math.round(total * 100);
  const raw = weights.map((w) => (cents * w) / sum);
  const floored = raw.map(Math.floor);
  let rest = cents - floored.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (rest <= 0) break;
    floored[i]++;
    rest--;
  }
  // Preis je Exemplar
  return floored.map((c, i) => Math.round(c / items[i].quantity) / 100);
}
