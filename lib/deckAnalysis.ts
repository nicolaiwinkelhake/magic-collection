import type { CardRole } from "@/lib/cardRoles";
import { isLand } from "@/lib/cardRoles";
import { withinIdentity } from "@/lib/colorIdentity";

export type DeckCardLike = {
  name: string;
  type_line: string | null;
  oracle_text: string | null;
  cmc: number | null;
  colors: string[] | null;
  color_identity?: string[] | null;
  is_commander: boolean;
};

// Rollen je Kartenname aus Scryfall-Tags (lib/cardRoles.ts). Fehlt eine
// Karte darin, greifen die Oracle-Text-Muster unten als Rückfall.
export type RolesByName = Map<string, CardRole[]>;

export type DeckSuggestion = {
  severity: "info" | "warning";
  message: string;
};

const RAMP_PATTERNS = [
  /search your library for a basic land/i,
  /add \{[wubrgc]\}/i,
  /add one mana/i,
  /mana of any (one )?color/i,
];

const REMOVAL_PATTERNS = [
  /destroy target/i,
  /exile target/i,
  /target (creature|permanent|player) (gets|loses)/i,
  /deals? \d+ damage to target/i,
];

const DRAW_PATTERNS = [
  /draw a card/i,
  /draw two cards/i,
  /draw cards/i,
];

const WIPE_PATTERNS = [
  /destroy all/i,
  /each (creature|player) sacrifices/i,
  /exile all/i,
];

function matchesAny(text: string | null, patterns: RegExp[]): boolean {
  if (!text) return false;
  return patterns.some((p) => p.test(text));
}

const FALLBACK_PATTERNS: Partial<Record<CardRole, RegExp[]>> = {
  ramp: RAMP_PATTERNS,
  removal: REMOVAL_PATTERNS,
  draw: DRAW_PATTERNS,
  wipe: WIPE_PATTERNS,
};

// Hat die Karte die Rolle? Scryfall-Tags, sonst Oracle-Text-Muster.
export function hasRole(card: DeckCardLike, role: CardRole, roles?: RolesByName): boolean {
  const known = roles?.get(card.name);
  if (known) return known.includes(role);
  const patterns = FALLBACK_PATTERNS[role];
  return patterns ? matchesAny(card.oracle_text, patterns) : false;
}

export function analyzeDeck(
  cards: DeckCardLike[],
  commanderColorIdentity: string[],
  roles?: RolesByName
): { stats: Record<string, number>; suggestions: DeckSuggestion[] } {
  const nonCommander = cards.filter((c) => !c.is_commander);

  const lands = nonCommander.filter((c) => isLand(c));
  const nonlands = nonCommander.filter((c) => !isLand(c));

  const ramp = nonlands.filter((c) => hasRole(c, "ramp", roles));
  const removal = nonlands.filter((c) => hasRole(c, "removal", roles));
  const draw = nonlands.filter((c) => hasRole(c, "draw", roles));
  const wipes = nonlands.filter((c) => hasRole(c, "wipe", roles));

  const avgCmc =
    nonlands.reduce((sum, c) => sum + (c.cmc ?? 0), 0) /
    (nonlands.length || 1);

  const highCurve = nonlands.filter((c) => (c.cmc ?? 0) >= 6);

  // Farbidentität-Verstöße: Identität der Karte (inkl. Fähigkeitskosten)
  // außerhalb der Commander-Identität. Ohne Identität: Rückfall auf Farben.
  const illegalColors = commanderColorIdentity.length
    ? nonCommander.filter(
        (c) => !withinIdentity(c.color_identity ?? c.colors ?? [], commanderColorIdentity)
      )
    : [];

  const totalCards = cards.length;

  const suggestions: DeckSuggestion[] = [];

  if (totalCards > 0 && totalCards < 100) {
    suggestions.push({
      severity: "warning",
      message: `Das Deck hat aktuell ${totalCards} Karten – für ein reguläres Commander-Deck fehlen ${
        100 - totalCards
      } Karten bis zur Standardgröße von 100.`,
    });
  }

  if (lands.length < 34 && totalCards >= 60) {
    suggestions.push({
      severity: "warning",
      message: `Nur ${lands.length} Länder erkannt. Empfohlen sind meist 35–38 für ein konsistentes Commander-Deck.`,
    });
  }

  if (ramp.length < 8 && totalCards >= 60) {
    suggestions.push({
      severity: "warning",
      message: `Nur ${ramp.length} Mana-Beschleuniger gefunden. 8–12 Ramp-Karten sorgen für konstantere Starts.`,
    });
  }

  if (removal.length < 8 && totalCards >= 60) {
    suggestions.push({
      severity: "warning",
      message: `Nur ${removal.length} Removal-/Interaktionskarten gefunden. 8–10 werden empfohlen, um auf Bedrohungen reagieren zu können.`,
    });
  }

  if (draw.length < 8 && totalCards >= 60) {
    suggestions.push({
      severity: "warning",
      message: `Nur ${draw.length} Kartenzieh-Effekte gefunden. 8–10 helfen, nicht die Hand leer zu spielen.`,
    });
  }

  if (wipes.length === 0 && totalCards >= 60) {
    suggestions.push({
      severity: "info",
      message:
        "Kein Board Wipe (z. B. Massenvernichtung) erkannt. Optional, aber in mehrspielerigen Partien oft hilfreich.",
    });
  }

  if (highCurve.length > nonlands.length * 0.25 && nonlands.length > 0) {
    suggestions.push({
      severity: "info",
      message: `${highCurve.length} Karten kosten 6+ Mana – das ist recht oberlastig. Eine niedrigere Kurve sorgt für mehr Konsistenz.`,
    });
  }

  if (illegalColors.length > 0) {
    suggestions.push({
      severity: "warning",
      message: `${illegalColors.length} Karte(n) liegen außerhalb der Farbidentität des Commanders und sind regeltechnisch nicht erlaubt: ${illegalColors
        .map((c) => c.name)
        .join(", ")}`,
    });
  }

  if (suggestions.length === 0 && totalCards >= 60) {
    suggestions.push({
      severity: "info",
      message:
        "Die Grundstruktur (Länder, Ramp, Removal, Draw) sieht solide aus!",
    });
  }

  return {
    stats: {
      totalCards,
      lands: lands.length,
      ramp: ramp.length,
      removal: removal.length,
      draw: draw.length,
      wipes: wipes.length,
      avgCmc: Math.round(avgCmc * 100) / 100,
    },
    suggestions,
  };
}

// Leitet aus dem Deck ab, in welchen Kategorien Vorschläge sinnvoll sind
// (unterhalb der Richtwerte). Reihenfolge = Priorität.
export function weakCategories(
  cards: DeckCardLike[],
  roles?: RolesByName
): Array<"ramp" | "removal" | "draw" | "wipe"> {
  const { stats } = analyzeDeck(cards, [], roles);
  const weak: Array<"ramp" | "removal" | "draw" | "wipe"> = [];
  if (stats.removal < 8) weak.push("removal");
  if (stats.ramp < 8) weak.push("ramp");
  if (stats.draw < 8) weak.push("draw");
  if (stats.wipes < 1) weak.push("wipe");
  return weak;
}
