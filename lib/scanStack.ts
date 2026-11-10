// Scan-Stapel (rein, getestet): gescannte Karten sammeln, gleiche Karte
// (gleicher Druck + Foil) zusammenzählen, Werte summieren, rückgängig machen.

export type ScanMatch = {
  id: string; // Scryfall-ID = genauer Druck
  name: string;
  imageUrl: string | null;
  eur: number | null;
  eurFoil: number | null;
  typeLine?: string;
  set?: string;
  setName?: string | null;
  collectorNumber?: string;
  exact?: boolean;
};

export type ScanItem = ScanMatch & {
  key: string;
  foil: boolean;
  quantity: number;
  scannedAt: number;
  /** Fingerabdruck des Kamerabilds (für "Druck ändern" nach Ähnlichkeit) */
  camHash?: number[];
};

const itemKey = (id: string, foil: boolean) => `${id}|${foil ? 1 : 0}`;

/** Neue Karte oben auf den Stapel; gleicher Druck + Foil erhöht nur die Menge. */
export function addScan(
  stack: ScanItem[],
  match: ScanMatch,
  foil: boolean,
  now = Date.now(),
  camHash?: number[],
): ScanItem[] {
  const key = itemKey(match.id, foil);
  const existing = stack.find((s) => s.key === key);
  if (existing) {
    return [
      { ...existing, quantity: existing.quantity + 1, scannedAt: now },
      ...stack.filter((s) => s.key !== key),
    ];
  }
  return [{ ...match, key, foil, quantity: 1, scannedAt: now, ...(camHash ? { camHash } : {}) }, ...stack];
}

/** Letzten Scan zurücknehmen (Menge −1 bzw. entfernen). */
export function undoLast(stack: ScanItem[]): ScanItem[] {
  const [top, ...rest] = stack;
  if (!top) return stack;
  return top.quantity > 1 ? [{ ...top, quantity: top.quantity - 1 }, ...rest] : rest;
}

export function setQuantity(stack: ScanItem[], key: string, quantity: number): ScanItem[] {
  return quantity <= 0
    ? stack.filter((s) => s.key !== key)
    : stack.map((s) => (s.key === key ? { ...s, quantity } : s));
}

/** Foil umschalten oder Druck wechseln; trifft das auf einen vorhandenen Eintrag, werden beide zusammengelegt. */
export function updateItem(
  stack: ScanItem[],
  key: string,
  change: { foil?: boolean; print?: ScanMatch },
): ScanItem[] {
  const item = stack.find((s) => s.key === key);
  if (!item) return stack;
  const next: ScanItem = { ...item, ...(change.print ?? {}), foil: change.foil ?? item.foil };
  next.key = itemKey(next.id, next.foil);
  const others = stack.filter((s) => s.key !== key);
  const twin = others.find((s) => s.key === next.key);
  if (twin) {
    return stack
      .filter((s) => s.key !== key)
      .map((s) => (s.key === twin.key ? { ...s, quantity: s.quantity + item.quantity } : s));
  }
  return stack.map((s) => (s.key === key ? next : s));
}

export function unitPrice(item: Pick<ScanItem, "foil" | "eur" | "eurFoil">): number {
  return (item.foil ? item.eurFoil ?? item.eur : item.eur) ?? 0;
}

export function stackTotals(stack: ScanItem[]): { cards: number; value: number } {
  let cards = 0;
  let value = 0;
  for (const s of stack) {
    cards += s.quantity;
    value += unitPrice(s) * s.quantity;
  }
  return { cards, value: Math.round(value * 100) / 100 };
}
