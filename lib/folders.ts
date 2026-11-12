// Ordner-Kennzahlen (rein, getestet). Ordner funktionieren wie Playlists:
// Eine Karte – aus der Sammlung oder von der Wunschliste – kann in beliebig
// vielen Ordnern stehen (folder_ids) und zählt dann in jedem davon mit.
// "Ohne Ordner" sind Karten, die in keinem Ordner stehen.
import { cardValue, type ValuableCard } from "@/lib/valuation";

export const UNSORTED = "none";
export const ALL = "all";
/** Auswahl in der Ordnerleiste: alle, ohne Ordner oder eine Ordner-ID */
export type FolderFilter = typeof ALL | typeof UNSORTED | string;

export type InFolders = { folder_ids?: string[] | null };
export type FolderStat = { cards: number; entries: number; value: number };

type Measure<T> = { count: (t: T) => number; value: (t: T) => number };

/** Sammlung: Exemplare und zustandsbereinigter Wert */
export const collectionMeasure: Measure<ValuableCard> = { count: (c) => c.quantity ?? 1, value: cardValue };
/** Wunschliste: je Karte ein Exemplar zum aktuellen Preis */
export const wishlistMeasure: Measure<{ price_eur: number | null }> = { count: () => 1, value: (w) => w.price_eur ?? 0 };

export function folderStats<T extends InFolders>(items: T[], measure: Measure<T>): Map<string, FolderStat> {
  const stats = new Map<string, FolderStat>();
  const add = (key: string, n: number, v: number) => {
    const s = stats.get(key) ?? { cards: 0, entries: 0, value: 0 };
    s.cards += n;
    s.entries += 1;
    s.value += v;
    stats.set(key, s);
  };
  for (const it of items) {
    const n = measure.count(it);
    const v = measure.value(it);
    add(ALL, n, v);
    const ids = new Set(it.folder_ids ?? []);
    if (!ids.size) add(UNSORTED, n, v);
    for (const id of ids) add(id, n, v);
  }
  for (const s of stats.values()) s.value = Math.round(s.value * 100) / 100;
  return stats;
}

export function inFolder<T extends InFolders>(items: T[], filter: FolderFilter): T[] {
  if (filter === ALL) return items;
  if (filter === UNSORTED) return items.filter((c) => !c.folder_ids?.length);
  return items.filter((c) => c.folder_ids?.includes(filter));
}

/** Ordner-Zuordnungen (folder_entries) an Karten hängen. */
export function attachFolders<T extends { id: string }>(
  items: T[],
  entries: Array<{ folder_id: string; target: string | null }>,
): Array<T & { folder_ids: string[] }> {
  const byTarget = new Map<string, string[]>();
  for (const e of entries) {
    if (!e.target) continue;
    const list = byTarget.get(e.target) ?? [];
    if (!list.includes(e.folder_id)) list.push(e.folder_id);
    byTarget.set(e.target, list);
  }
  return items.map((it) => ({ ...it, folder_ids: byTarget.get(it.id) ?? [] }));
}

/** Zuordnung lokal ändern (nach erfolgreichem Speichern). */
export function withFolder<T extends InFolders & { id: string }>(items: T[], ids: Set<string>, folderId: string, add: boolean): T[] {
  return items.map((it) => {
    if (!ids.has(it.id)) return it;
    const cur = it.folder_ids ?? [];
    const next = add ? (cur.includes(folderId) ? cur : [...cur, folderId]) : cur.filter((f) => f !== folderId);
    return next === cur ? it : { ...it, folder_ids: next };
  });
}
