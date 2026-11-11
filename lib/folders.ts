// Ordner-Kennzahlen (rein, getestet): Kartenzahl und Wert je Ordner,
// "Unsortiert" (folder_id null) und gesamt. Wert zustandsbereinigt wie in
// der übrigen App (cardValue).
import { cardValue, type ValuableCard } from "@/lib/valuation";

export const UNSORTED = "none";
export const ALL = "all";
/** Auswahl in der Ordnerleiste: alle, Unsortiert oder eine Ordner-ID */
export type FolderFilter = typeof ALL | typeof UNSORTED | string;

type Row = ValuableCard & { folder_id?: string | null };
export type FolderStat = { cards: number; entries: number; value: number };

export function folderStats<T extends Row>(cards: T[]): Map<string, FolderStat> {
  const stats = new Map<string, FolderStat>();
  const add = (key: string, c: T) => {
    const s = stats.get(key) ?? { cards: 0, entries: 0, value: 0 };
    s.cards += c.quantity ?? 1;
    s.entries += 1;
    s.value += cardValue(c);
    stats.set(key, s);
  };
  for (const c of cards) {
    add(ALL, c);
    add(c.folder_id ?? UNSORTED, c);
  }
  for (const s of stats.values()) s.value = Math.round(s.value * 100) / 100;
  return stats;
}

export function inFolder<T extends Row>(cards: T[], filter: FolderFilter): T[] {
  if (filter === ALL) return cards;
  if (filter === UNSORTED) return cards.filter((c) => !c.folder_id);
  return cards.filter((c) => c.folder_id === filter);
}
