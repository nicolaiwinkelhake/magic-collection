// Commander-Bracket-Einstufung (offizielles 5-Stufen-System, Beta 2025/26).
// Rein funktional und testbar. Die Einstufung folgt dem offiziellen
// Entscheidungsbaum: zuerst Anzahl der "Game Changer", dann Massen-
// Landzerstörung und schnelle Zwei-Karten-Combos, sonst Signale wie
// schnelle Manabeschleunigung/Tutoren.
//
// Die Liste der Game-Changer-Karten stammt von Scryfall (is:gamechanger)
// und wird der App als Datensatz übergeben, damit sie ohne fest
// codierte Kartennamen aktuell gehalten werden kann.

import { detectCombos, formatCombo } from "@/lib/combos";

export type BracketCardLike = {
  name: string;
  type_line: string | null;
  oracle_text: string | null;
  is_commander: boolean;
};

export type BracketResult = {
  bracket: 1 | 2 | 3 | 4;
  label: string;
  gameChangers: string[];
  reasons: string[];
  signals: {
    gameChangerCount: number;
    massLandDenial: string[];
    fastMana: string[];
    tutors: string[];
    twoCardCombo: boolean;
  };
};

export const BRACKET_LABEL: Record<number, string> = {
  1: "Bracket 1 – Exhibition (ultra-casual)",
  2: "Bracket 2 – Core (Precon-Niveau)",
  3: "Bracket 3 – Upgraded (getunt)",
  4: "Bracket 4 – Optimized (High-Power)",
};

// Muster für Massen-Landzerstörung (erzwingt mindestens Bracket 4)
const MASS_LAND_DENIAL = [
  /destroy all lands/i,
  /each player sacrifices? .*lands?/i,
  /destroy target land.*for each/i,
];

// Grobe Heuristik für schnelle Manabeschleunigung (Signalzählung)
const FAST_MANA = [
  /add .*mana.*(?:that|which) .*doesn't empty/i,
  /add \{c\}\{c\}/i,
  /search your library for a .*land card.*onto the battlefield/i,
];

// Tutoren (Signalzählung)
const TUTOR = [
  /search your library for a(?:n)? .*card.*(?:hand|onto the battlefield|top)/i,
];

function matchesAny(text: string | null, patterns: RegExp[]): boolean {
  if (!text) return false;
  return patterns.some((p) => p.test(text));
}

export function analyzeBracket(
  cards: BracketCardLike[],
  gameChangerNames: string[]
): BracketResult {
  const gcSet = new Set(gameChangerNames.map((n) => n.toLowerCase()));

  const gameChangers = cards
    .filter((c) => gcSet.has(c.name.toLowerCase()))
    .map((c) => c.name);

  const massLandDenial = cards
    .filter((c) => matchesAny(c.oracle_text, MASS_LAND_DENIAL))
    .map((c) => c.name);

  const fastMana = cards
    .filter((c) => matchesAny(c.oracle_text, FAST_MANA))
    .map((c) => c.name);

  const tutors = cards
    .filter(
      (c) =>
        matchesAny(c.oracle_text, TUTOR) &&
        !c.type_line?.toLowerCase().includes("land")
    )
    .map((c) => c.name);

  // Zwei-Karten-Combos: Erkennung über eine kuratierte Liste bekannter
  // Kombinationen (lib/combos.ts). Nicht erschöpfend – vollständiger
  // Abgleich wäre über Commander Spellbook möglich.
  const combos = detectCombos(cards.map((c) => c.name));
  const twoCardCombo = combos.length > 0;

  const gcCount = gameChangers.length;
  const reasons: string[] = [];
  let bracket: 1 | 2 | 3 | 4;

  if (massLandDenial.length > 0) {
    bracket = 4;
    reasons.push(
      `Massen-Landzerstörung erkannt (${massLandDenial.join(", ")}) – erzwingt mindestens Bracket 4.`
    );
  } else if (gcCount >= 4) {
    bracket = 4;
    reasons.push(`${gcCount} Game Changer (4+) → Bracket 4.`);
  } else if (gcCount >= 1) {
    bracket = 3;
    reasons.push(
      `${gcCount} Game Changer (1–3) → mindestens Bracket 3: ${gameChangers.join(", ")}.`
    );
  } else {
    // Keine Game Changer → Bracket 1 oder 2. Bracket 1 ist bewusst
    // ultra-casual; ohne weitere Signale ordnen wir als Bracket 2 (Core) ein.
    bracket = 2;
    reasons.push("Keine Game Changer – casual (Bracket 1–2).");
  }

  // Zusätzliche Signale anmerken (verschieben die Stufe nicht automatisch,
  // geben dem Nutzer aber Kontext für ein manuelles Hochstufen).
  if (bracket < 4 && (fastMana.length >= 2 || tutors.length >= 3)) {
    reasons.push(
      `Viele Tempo-Signale (schnelle Manabeschleunigung: ${fastMana.length}, Tutoren: ${tutors.length}) – ggf. eine Stufe höher einordnen.`
    );
  }

  // Bekannte Zwei-Karten-Combos heben das Deck auf mindestens Bracket 3.
  if (twoCardCombo) {
    reasons.push(
      `Bekannte Zwei-Karten-Combo(s) im Deck: ${combos.map(formatCombo).join("; ")}.`
    );
    if (bracket < 3) {
      bracket = 3;
      reasons.push("Zwei-Karten-Combo → mindestens Bracket 3.");
    }
  }

  return {
    bracket,
    label: BRACKET_LABEL[bracket],
    gameChangers,
    reasons,
    signals: {
      gameChangerCount: gcCount,
      massLandDenial,
      fastMana,
      tutors,
      twoCardCombo,
    },
  };
}
