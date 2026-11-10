// Gruppiert Deckkarten nach Kartentyp (wie in gängigen Deck-Apps):
// Commander zuerst, dann Kreaturen, Planeswalker, ... und Länder.
// Maßgeblich ist die Vorderseite; Kreatur schlägt alles (Dryad Arbor),
// Land kommt vor Artefakt/Verzauberung (Artefaktländer zählen als Land).

export type TypeGroupKey =
  | "commander"
  | "creature"
  | "planeswalker"
  | "battle"
  | "instant"
  | "sorcery"
  | "land"
  | "artifact"
  | "enchantment"
  | "other";

export const TYPE_GROUP_LABEL: Record<TypeGroupKey, string> = {
  commander: "Commander",
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

const ORDER: TypeGroupKey[] = [
  "commander",
  "creature",
  "planeswalker",
  "battle",
  "instant",
  "sorcery",
  "artifact",
  "enchantment",
  "land",
  "other",
];

export function typeGroupOf(card: { type_line: string | null; is_commander?: boolean }): TypeGroupKey {
  if (card.is_commander) return "commander";
  const front = (card.type_line ?? "").split("//")[0].toLowerCase();
  if (front.includes("creature")) return "creature";
  if (front.includes("planeswalker")) return "planeswalker";
  if (front.includes("battle")) return "battle";
  if (front.includes("instant")) return "instant";
  if (front.includes("sorcery")) return "sorcery";
  if (front.includes("land")) return "land";
  if (front.includes("artifact")) return "artifact";
  if (front.includes("enchantment")) return "enchantment";
  return "other";
}

/** Gruppen in fester Reihenfolge; leere Gruppen fallen weg. `count` zählt Kopien. */
export function groupByType<T extends { type_line: string | null; is_commander?: boolean }>(
  stacks: T[][],
): { key: TypeGroupKey; label: string; count: number; stacks: T[][] }[] {
  const map = new Map<TypeGroupKey, T[][]>();
  for (const stack of stacks) {
    if (!stack.length) continue;
    const key = typeGroupOf(stack[0]);
    const list = map.get(key);
    if (list) list.push(stack);
    else map.set(key, [stack]);
  }
  return ORDER.filter((k) => map.has(k)).map((key) => {
    const list = map.get(key)!;
    return { key, label: TYPE_GROUP_LABEL[key], count: list.reduce((n, s) => n + s.length, 0), stacks: list };
  });
}
