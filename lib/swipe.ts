// Wisch-Erkennung für die Kartendetail-Ansicht: waagerechte Bewegung über
// einer Schwelle und deutlich stärker als die senkrechte (sonst ist es
// Scrollen). Nach links wischen = nächste Karte (+1), nach rechts = vorherige (-1).
export function swipeStep(dx: number, dy: number, threshold = 60): -1 | 0 | 1 {
  if (Math.abs(dx) < threshold) return 0;
  if (Math.abs(dx) < Math.abs(dy) * 1.5) return 0;
  return dx < 0 ? 1 : -1;
}

/** Index der Nachbarkarte oder null am Rand (kein Umlauf). */
export function neighborIndex(index: number, step: number, length: number): number | null {
  if (index < 0) return null;
  const next = index + step;
  return next >= 0 && next < length ? next : null;
}
