// Teilt Deckkarten automatisch in Rollen-Buckets ein (Länder, Ramp, Removal,
// Kartenziehen, Board Wipe, Kreaturen, Sonstiges). Rein funktional & testbar.
// Nutzt dieselben Oracle-Muster wie die Deck-Analyse, für konsistente Ergebnisse.

import type { CardRole } from "@/lib/cardRoles";
import { isLand } from "@/lib/cardRoles";

export type CategorizableCard = {
  name: string;
  type_line: string | null;
  oracle_text: string | null;
  cmc: number | null;
  is_commander: boolean;
};

export type DeckCategory =
  | "Commander"
  | "Länder"
  | "Ramp"
  | "Removal"
  | "Kartenziehen"
  | "Board Wipe"
  | "Tutor"
  | "Counterspell"
  | "Schutz"
  | "Rekursion"
  | "Kreaturen"
  | "Sonstiges";

export const CATEGORY_ORDER: DeckCategory[] = [
  "Commander",
  "Länder",
  "Ramp",
  "Removal",
  "Board Wipe",
  "Kartenziehen",
  "Tutor",
  "Counterspell",
  "Schutz",
  "Rekursion",
  "Kreaturen",
  "Sonstiges",
];

const RAMP = [
  /search your library for a basic land/i,
  /add \{[wubrgc]\}/i,
  /add one mana/i,
  /mana of any (one )?color/i,
];
const REMOVAL = [
  /destroy target/i,
  /exile target/i,
  /target (creature|permanent|player) (gets|loses)/i,
  /deals? \d+ damage to target/i,
];
const DRAW = [/draw a card/i, /draw two cards/i, /draw cards/i];
const WIPE = [/destroy all/i, /each (creature|player) sacrifices/i, /exile all/i];

function matchesAny(text: string | null, patterns: RegExp[]): boolean {
  if (!text) return false;
  return patterns.some((p) => p.test(text));
}

// Priorität, wenn eine Karte mehrere Scryfall-Rollen hat.
const ROLE_PRIORITY: Array<[CardRole, DeckCategory]> = [
  ["wipe", "Board Wipe"],
  ["removal", "Removal"],
  ["ramp", "Ramp"],
  ["draw", "Kartenziehen"],
  ["tutor", "Tutor"],
  ["counter", "Counterspell"],
  ["protection", "Schutz"],
  ["recursion", "Rekursion"],
];

// Ordnet einer Karte GENAU eine Kategorie zu (nach Priorität), damit die
// Summe der Buckets der Deckgröße entspricht. roles = Scryfall-Tags je Name;
// fehlt die Karte darin, greifen die Oracle-Muster.
export function categorizeCard(card: CategorizableCard, roles?: Map<string, CardRole[]>): DeckCategory {
  if (card.is_commander) return "Commander";
  const type = card.type_line?.toLowerCase() ?? "";
  if (isLand(card)) return "Länder";
  const known = roles?.get(card.name);
  if (known) {
    const hit = ROLE_PRIORITY.find(([role]) => known.includes(role));
    if (hit) return hit[1];
    return type.includes("creature") ? "Kreaturen" : "Sonstiges";
  }
  if (matchesAny(card.oracle_text, WIPE)) return "Board Wipe";
  if (matchesAny(card.oracle_text, REMOVAL)) return "Removal";
  if (matchesAny(card.oracle_text, RAMP)) return "Ramp";
  if (matchesAny(card.oracle_text, DRAW)) return "Kartenziehen";
  if (type.includes("creature")) return "Kreaturen";
  return "Sonstiges";
}

export function categorizeDeck<T extends CategorizableCard>(
  cards: T[],
  roles?: Map<string, CardRole[]>
): Array<{ category: DeckCategory; cards: T[] }> {
  const buckets = new Map<DeckCategory, T[]>();
  for (const card of cards) {
    const cat = categorizeCard(card, roles);
    if (!buckets.has(cat)) buckets.set(cat, []);
    buckets.get(cat)!.push(card);
  }
  return CATEGORY_ORDER.filter((c) => buckets.has(c)).map((category) => ({
    category,
    cards: buckets.get(category)!,
  }));
}
