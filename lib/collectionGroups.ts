// Gruppierung der Sammlung (wie "Gruppieren nach" in Sammel-Apps):
// nach Set, Farbe, Seltenheit oder Kartentyp – jeweils mit Kartenzahl und
// Wert. Reihenfolge der Karten innerhalb einer Gruppe bleibt erhalten.

import { cardValue, type ValuableCard } from "@/lib/valuation";

export type GroupKey = "none" | "set" | "color" | "rarity" | "type";

export const GROUP_LABEL: Record<GroupKey, string> = {
  none: "Keine",
  set: "Set",
  color: "Farbe",
  rarity: "Seltenheit",
  type: "Typ",
};

type GroupableCard = ValuableCard & {
  set_code: string | null;
  colors: string[] | null;
  rarity: string | null;
  type_line: string | null;
};

export type CardGroup<T> = { key: string; label: string; cards: T[]; count: number; value: number };

const COLOR_NAME: Record<string, string> = { W: "Weiß", U: "Blau", B: "Schwarz", R: "Rot", G: "Grün" };
const COLOR_ORDER = ["W", "U", "B", "R", "G", "M", "C"];
const RARITY_ORDER = ["mythic", "rare", "uncommon", "common", "special", "bonus"];
const RARITY_NAME: Record<string, string> = {
  mythic: "Mythic",
  rare: "Rare",
  uncommon: "Uncommon",
  common: "Common",
  special: "Special",
  bonus: "Bonus",
};
const TYPE_ORDER = ["creature", "planeswalker", "battle", "instant", "sorcery", "artifact", "enchantment", "land", "other"];
const TYPE_NAME: Record<string, string> = {
  creature: "Kreaturen",
  planeswalker: "Planeswalker",
  battle: "Schlachten",
  instant: "Spontanzauber",
  sorcery: "Hexereien",
  artifact: "Artefakte",
  enchantment: "Verzauberungen",
  land: "Länder",
  other: "Sonstige",
};

function typeKey(typeLine: string | null): string {
  const t = (typeLine ?? "").split("//")[0].toLowerCase();
  if (t.includes("creature")) return "creature";
  for (const k of ["planeswalker", "battle", "instant", "sorcery", "land", "artifact", "enchantment"]) {
    if (t.includes(k)) return k;
  }
  return "other";
}

function keyOf(card: GroupableCard, by: GroupKey): string {
  switch (by) {
    case "set":
      return card.set_code?.toLowerCase() || "?";
    case "color": {
      const c = card.colors ?? [];
      return c.length === 0 ? "C" : c.length > 1 ? "M" : c[0];
    }
    case "rarity":
      return card.rarity ?? "?";
    case "type":
      return typeKey(card.type_line);
    default:
      return "all";
  }
}

function labelOf(key: string, by: GroupKey): string {
  switch (by) {
    case "set":
      return key === "?" ? "Unbekanntes Set" : key.toUpperCase();
    case "color":
      return key === "C" ? "Farblos" : key === "M" ? "Mehrfarbig" : COLOR_NAME[key] ?? key;
    case "rarity":
      return RARITY_NAME[key] ?? "Unbekannt";
    case "type":
      return TYPE_NAME[key] ?? key;
    default:
      return "Alle Karten";
  }
}

function rank(key: string, by: GroupKey): number {
  const order = by === "color" ? COLOR_ORDER : by === "rarity" ? RARITY_ORDER : by === "type" ? TYPE_ORDER : [];
  const i = order.indexOf(key);
  return i === -1 ? order.length : i;
}

export function groupCards<T extends GroupableCard>(cards: T[], by: GroupKey): CardGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const card of cards) {
    const k = keyOf(card, by);
    const list = map.get(k);
    if (list) list.push(card);
    else map.set(k, [card]);
  }
  const groups = [...map.entries()].map(([key, list]) => ({
    key,
    label: labelOf(key, by),
    cards: list,
    count: list.reduce((n, c) => n + (c.quantity ?? 1), 0),
    value: Math.round(list.reduce((n, c) => n + cardValue(c), 0) * 100) / 100,
  }));
  if (by === "set") {
    // Sets alphabetisch, Unbekannt ans Ende.
    groups.sort((a, b) => (a.key === "?" ? 1 : b.key === "?" ? -1 : a.key.localeCompare(b.key)));
  } else if (by !== "none") {
    groups.sort((a, b) => rank(a.key, by) - rank(b.key, by));
  }
  return groups;
}
