// Ähnlichkeit zweier Namen (rein, getestet) – für Texterkennung mit
// Lesefehlern: 1 = gleich, 0 = völlig verschieden. Groß/Klein, Akzente,
// Satzzeichen und Leerzeichen spielen keine Rolle.

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export function nameSimilarity(a: string, b: string): number {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return 0;
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
}

/** Bester Kandidat über einer Mindestähnlichkeit, sonst null. */
export function bestNameMatch<T>(read: string, items: T[], nameOf: (t: T) => string | null | undefined, min = 0.8) {
  let best: { item: T; score: number } | null = null;
  for (const item of items) {
    const n = nameOf(item);
    if (!n) continue;
    // Doppelseitig: auch nur die Vorderseite vergleichen
    const score = Math.max(nameSimilarity(read, n), nameSimilarity(read, n.split(" // ")[0]));
    if (score >= min && (!best || score > best.score)) best = { item, score };
  }
  return best;
}
