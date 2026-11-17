// Deutsches Kartennamen-Wörterbuch für den Scanner (rein, getestet):
// gelesener deutscher Name → englischer Kartenname, ohne Netz.
import { buildNameIndex, type NameIndex } from "@/lib/nameIndex";

export type GermanIndex = {
  /** Wörterbuch über die deutschen Namen */
  index: NameIndex;
  /** deutscher Name → englische Kartennamen (fast immer genau einer) */
  english: Map<string, string[]>;
};

export function buildGermanIndex(pairs: Array<[de: string, en: string]>): GermanIndex {
  const english = new Map<string, string[]>();
  for (const [de, en] of pairs) {
    const list = english.get(de);
    if (!list) english.set(de, [en]);
    else if (!list.includes(en)) list.push(en);
  }
  return { index: buildNameIndex(Array.from(english.keys())), english };
}

/** Englischer Name zu einem deutschen – nur wenn eindeutig. */
export function englishFor(german: GermanIndex, de: string): string | null {
  const list = german.english.get(de);
  return list?.length === 1 ? list[0] : null;
}
