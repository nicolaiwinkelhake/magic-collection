// Filtern und Sortieren einer Kartenliste (rein, getestet) – gemeinsam für
// die eigene und die geteilte Sammlung.
import type { FilterState } from "@/components/Filters";

type FilterableCard = {
  name: string;
  name_de?: string | null;
  rarity: string | null;
  set_code: string | null;
  type_line: string | null;
  colors: string[] | null;
  cmc: number | null;
  foil: boolean;
  price_eur: number | null;
  price_eur_foil: number | null;
};

export const DEFAULT_FILTERS: FilterState = {
  search: "",
  colors: [],
  rarity: "",
  type: "",
  set: "",
  sort: "color",
  group: "none",
};

// WUBRG-Reihenfolge: Weiß, Blau, Schwarz, Rot, Grün, Mehrfarbig, Farblos
const COLOR_ORDER: Record<string, number> = { W: 0, U: 1, B: 2, R: 3, G: 4 };
function colorRank(colors: string[] | null): number {
  const c = colors ?? [];
  if (c.length === 0) return 6; // farblos
  if (c.length > 1) return 5; // mehrfarbig
  return COLOR_ORDER[c[0]] ?? 6;
}

const priceOf = (c: FilterableCard) => (c.foil ? c.price_eur_foil : c.price_eur) ?? 0;

export function filterAndSortCards<T extends FilterableCard>(cards: T[], filters: FilterState): T[] {
  const search = filters.search.trim().toLowerCase();
  const type = filters.type.toLowerCase();
  const result = cards.filter((card) => {
    if (search && !card.name.toLowerCase().includes(search) && !card.name_de?.toLowerCase().includes(search)) return false;
    if (filters.rarity && card.rarity !== filters.rarity) return false;
    if (filters.set && card.set_code !== filters.set) return false;
    if (type && !card.type_line?.toLowerCase().includes(type)) return false;
    if (filters.colors.length) {
      const cardColors = card.colors ?? [];
      if (!filters.colors.every((c) => cardColors.includes(c))) return false;
    }
    return true;
  });

  const sorted = [...result];
  switch (filters.sort) {
    case "color":
      sorted.sort((a, b) => colorRank(a.colors) - colorRank(b.colors) || a.name.localeCompare(b.name));
      break;
    case "cmc":
      sorted.sort((a, b) => (a.cmc ?? 0) - (b.cmc ?? 0));
      break;
    case "price":
      sorted.sort((a, b) => priceOf(b) - priceOf(a));
      break;
    case "set":
      sorted.sort((a, b) => (a.set_code ?? "").localeCompare(b.set_code ?? "") || a.name.localeCompare(b.name));
      break;
    default:
      sorted.sort((a, b) => a.name.localeCompare(b.name));
  }
  return sorted;
}

/** Set-Kürzel der Karten, sortiert (für den Set-Filter). */
export function setCodes(cards: Array<{ set_code: string | null }>): string[] {
  const codes = new Set<string>();
  for (const c of cards) if (c.set_code) codes.add(c.set_code);
  return [...codes].sort();
}
