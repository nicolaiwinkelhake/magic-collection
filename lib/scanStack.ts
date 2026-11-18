// Scan-Stapel (rein, getestet): gescannte Karten sammeln, Werte summieren,
// rückgängig machen. Jeder Scan bleibt ein eigener Eintrag in Scan-Reihenfolge
// (neuester oben) – auch bei gleichem Druck. So lässt sich der Druck Karte für
// Karte mit dem echten Stapel abgleichen. Zusammengezählt wird erst beim
// Speichern in Sammlung/Deck.

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
  /** sofort bestätigt, Druck/Preis werden noch nachgeladen */
  pending?: boolean;
  /** Nachladen fehlgeschlagen – bitte korrigieren */
  failed?: boolean;
};

/** Eindeutiger Schlüssel je Scan */
export function scanKey(now = Date.now()): string {
  return `scan:${now}:${Math.random().toString(36).slice(2, 8)}`;
}

/** Neue Karte oben auf den Stapel – immer als eigener Eintrag. */
export function addScan(
  stack: ScanItem[],
  match: ScanMatch,
  foil: boolean,
  now = Date.now(),
  camHash?: number[],
  key = scanKey(now),
): ScanItem[] {
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

/** Foil umschalten oder Druck wechseln – nur dieser Eintrag, an seiner Stelle. */
export function updateItem(
  stack: ScanItem[],
  key: string,
  change: { foil?: boolean; print?: ScanMatch },
): ScanItem[] {
  return stack.map((s) => (s.key === key ? { ...s, ...(change.print ?? {}), key: s.key, foil: change.foil ?? s.foil } : s));
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

// ---------------------------------------------------------------------------
// Sofort bestätigen: Der Name ist sicher erkannt (Wörterbuch), Druck und Preis
// kommen im Hintergrund nach – der Scanner muss nicht auf das Netz warten.
// ---------------------------------------------------------------------------

/** Vorläufigen Eintrag oben anlegen; liefert den Schlüssel zum späteren Auflösen. */
export function pendingKey(now = Date.now()): string {
  return `pending:${now}:${Math.random().toString(36).slice(2, 8)}`;
}

export function addPending(stack: ScanItem[], name: string, foil: boolean, now = Date.now(), key = pendingKey(now)): { stack: ScanItem[]; key: string } {
  const item: ScanItem = { id: key, key, name, imageUrl: null, eur: null, eurFoil: null, foil, quantity: 1, scannedAt: now, pending: true };
  return { stack: [item, ...stack], key };
}

/**
 * Vorläufigen Eintrag durch den gefundenen Druck ersetzen – an seiner Stelle,
 * auch wenn der Druck schon im Stapel liegt. Wurde der Eintrag inzwischen
 * entfernt (rückgängig), bleibt der Stapel unverändert.
 */
export function resolvePending(stack: ScanItem[], key: string, match: ScanMatch, camHash?: number[]): ScanItem[] {
  return stack.map((s) =>
    s.key === key
      ? { ...match, key, foil: s.foil, quantity: s.quantity, scannedAt: s.scannedAt, ...(camHash ? { camHash } : {}) }
      : s,
  );
}

export function failPending(stack: ScanItem[], key: string): ScanItem[] {
  return stack.map((s) => (s.key === key ? { ...s, pending: false, failed: true } : s));
}

/** Noch nicht fertig zum Speichern? (lädt noch oder nicht gefunden) */
export function unresolved(stack: ScanItem[]): { pending: number; failed: number } {
  let pending = 0;
  let failed = 0;
  for (const s of stack) {
    if (s.pending) pending += 1;
    else if (s.failed) failed += 1;
  }
  return { pending, failed };
}
