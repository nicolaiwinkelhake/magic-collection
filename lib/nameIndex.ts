// Kartennamen-Wörterbuch für den Scanner (rein, getestet). Alle englischen
// Kartennamen (Scryfall-Katalog, ~35 000) liegen auf dem Gerät; ein per
// Texterkennung gelesener Name wird damit sofort – ohne Netz – korrigiert:
// "htning Bolt" → "Lightning Bolt". Schnell über ein Trigramm-Register,
// dann genaue Bewertung der besten Kandidaten.
import { levenshtein, normalizeName } from "@/lib/textSimilarity";

export type NameIndex = {
  names: string[];
  norm: string[];
  /** Trigramm → Indizes der Namen, die es enthalten */
  grams: Map<string, number[]>;
  exact: Map<string, number>;
};

function trigrams(s: string): string[] {
  const padded = `^${s}$`;
  const out: string[] = [];
  for (let i = 0; i + 3 <= padded.length; i++) out.push(padded.slice(i, i + 3));
  return out;
}

export function buildNameIndex(allNames: string[]): NameIndex {
  const names: string[] = [];
  const norm: string[] = [];
  const grams = new Map<string, number[]>();
  const exact = new Map<string, number>();
  const add = (display: string, key: string) => {
    if (key.length < 2 || exact.has(key)) return;
    const i = names.length;
    names.push(display);
    norm.push(key);
    exact.set(key, i);
    for (const g of new Set(trigrams(key))) {
      const list = grams.get(g);
      if (list) list.push(i);
      else grams.set(g, [i]);
    }
  };
  for (const n of allNames) {
    add(n, normalizeName(n));
    // Doppelseitige Karten: Vorderseite allein ist der gedruckte Name
    if (n.includes(" // ")) add(n, normalizeName(n.split(" // ")[0]));
  }
  return { names, norm, grams, exact };
}

/**
 * Kleinster Editierabstand von `q` zu irgendeinem Teilstück von `c`
 * (Anfang/Ende von c sind frei) – für abgeschnittene Lesungen.
 */
export function partialDistance(q: string, c: string): number {
  let prev = new Array<number>(c.length + 1).fill(0);
  for (let i = 1; i <= q.length; i++) {
    const cur = [i];
    for (let j = 1; j <= c.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (q[i - 1] === c[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return Math.min(...prev);
}

/** Ähnlichkeit einer Lesung zu einem Kartennamen (beide normalisiert), 0–1. */
export function readScore(q: string, c: string): number {
  if (!q || !c) return 0;
  const full = 1 - levenshtein(q, c) / Math.max(q.length, c.length);
  if (q.length < 6 || q.length >= c.length) return full;
  // Teil gelesen (Anfang/Ende abgeschnitten oder verdeckt)
  const partial = (1 - partialDistance(q, c) / q.length) * (0.7 + (0.3 * q.length) / c.length);
  return Math.max(full, partial);
}

export type NameMatch = { name: string; score: number; confident: boolean };

/**
 * Besten Kartennamen zu einer Lesung finden. `confident`: so sicher, dass der
 * Scanner sofort bestätigen darf (deutlicher Abstand zum Zweitbesten).
 */
export function matchName(index: NameIndex, read: string, opts: { candidates?: number } = {}): NameMatch | null {
  const raw = normalizeName(read);
  // Typische OCR-Verwechslungen (Ziffer statt Buchstabe) – Kartennamen
  // enthalten fast nie Ziffern
  const fixed = raw.replace(/1/g, "l").replace(/0/g, "o").replace(/5/g, "s").replace(/8/g, "b");
  if (fixed !== raw) {
    const a = matchOne(index, raw, opts);
    const b = matchOne(index, fixed, opts);
    return !a || (b && b.score > a.score) ? b : a;
  }
  return matchOne(index, raw, opts);
}

function matchOne(index: NameIndex, q: string, opts: { candidates?: number }): NameMatch | null {
  if (q.length < 3) return null;
  const hit = index.exact.get(q);
  if (hit !== undefined) return { name: index.names[hit], score: 1, confident: q.length >= 4 };

  const counts = new Map<number, number>();
  for (const g of new Set(trigrams(q))) {
    for (const i of index.grams.get(g) ?? []) counts.set(i, (counts.get(i) ?? 0) + 1);
  }
  const top = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, opts.candidates ?? 60);
  let best: { i: number; score: number } | null = null;
  let second = 0;
  for (const [i] of top) {
    const score = readScore(q, index.norm[i]);
    if (!best || score > best.score) {
      if (best && index.names[best.i] !== index.names[i]) second = Math.max(second, best.score);
      best = { i, score };
    } else if (index.names[i] !== index.names[best.i]) second = Math.max(second, score);
  }
  if (!best) return null;
  const score = Math.round(best.score * 1000) / 1000;
  const confident = score >= 0.82 && (score - second >= 0.06 || score >= 0.97);
  return { name: index.names[best.i], score, confident };
}
