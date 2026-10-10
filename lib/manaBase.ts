import { isLand } from "@/lib/cardRoles";

// Mana-Basis-Analyse (rein, getestet): Farbsymbole der Zauber vs. Quellen,
// die diese Farbe erzeugen. Grundidee wie bei gängigen Deckbau-Rechnern:
// Der Anteil der Quellen einer Farbe sollte grob ihrem Anteil an den
// Farbsymbolen entsprechen.

export const COLORS = ["W", "U", "B", "R", "G"] as const;
export type Color = (typeof COLORS)[number];

export type ManaCard = {
  name: string;
  type_line: string | null;
  mana_cost: string | null;
  produced_mana?: string[] | null;
  is_commander: boolean;
};

// Zählt Farbsymbole in einem Manakosten-String. Hybrid ({W/U}) zählt für
// beide Farben je 0,5, Phyrexianisch ({B/P}) voll, {2/W} voll.
export function countPips(manaCost: string | null): Record<Color, number> {
  const pips: Record<Color, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const [, symbol] of (manaCost ?? "").matchAll(/\{([^}]+)\}/g)) {
    const colors = symbol.split("/").filter((p): p is Color => (COLORS as readonly string[]).includes(p));
    for (const c of colors) pips[c] += 1 / colors.length;
  }
  return pips;
}

export type ColorStat = {
  color: Color;
  pips: number;
  pipShare: number;
  landSources: number;
  otherSources: number;
  sourceShare: number;
  status: "ok" | "low";
};

export type ManaBaseResult = {
  lands: number;
  colors: ColorStat[];
  warnings: string[];
};

const COLOR_NAME: Record<Color, string> = { W: "Weiß", U: "Blau", B: "Schwarz", R: "Rot", G: "Grün" };

export function analyzeManaBase(cards: ManaCard[]): ManaBaseResult {
  const pips: Record<Color, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  const landSources: Record<Color, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  const otherSources: Record<Color, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  let lands = 0;

  for (const card of cards) {
    const land = isLand(card);
    if (land && !card.is_commander) lands += 1;
    if (!land) {
      const p = countPips(card.mana_cost);
      for (const c of COLORS) pips[c] += p[c];
    }
    if (card.is_commander) continue;
    for (const c of card.produced_mana ?? []) {
      if (!(COLORS as readonly string[]).includes(c)) continue;
      if (land) landSources[c as Color] += 1;
      else otherSources[c as Color] += 1;
    }
  }

  const totalPips = COLORS.reduce((s, c) => s + pips[c], 0);
  const totalLandSources = COLORS.reduce((s, c) => s + landSources[c], 0);
  const warnings: string[] = [];

  const colors: ColorStat[] = COLORS.filter((c) => pips[c] > 0 || landSources[c] > 0).map((c) => {
    const pipShare = totalPips ? pips[c] / totalPips : 0;
    const sourceShare = totalLandSources ? landSources[c] / totalLandSources : 0;
    // Unter 75 % des "fairen" Anteils oder weniger als 8 Länder-Quellen bei
    // einer nennenswert genutzten Farbe → zu wenig Quellen.
    const low = pips[c] > 0 && lands > 0 && (sourceShare < pipShare * 0.75 || (pipShare >= 0.15 && landSources[c] < 8));
    if (low) {
      warnings.push(
        `${COLOR_NAME[c]}: ${Math.round(pipShare * 100)} % der Farbsymbole, aber nur ${landSources[c]} Länder erzeugen ${COLOR_NAME[c]}.`
      );
    }
    return {
      color: c,
      pips: Math.round(pips[c] * 10) / 10,
      pipShare,
      landSources: landSources[c],
      otherSources: otherSources[c],
      sourceShare,
      status: low ? "low" : "ok",
    };
  });

  return { lands, colors, warnings };
}

// Typenverteilung (Hauptkartentyp der Vorderseite) ohne Commander.
const TYPE_ORDER = ["Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Planeswalker", "Battle", "Land"] as const;
export const TYPE_LABEL: Record<(typeof TYPE_ORDER)[number], string> = {
  Creature: "Kreaturen",
  Instant: "Spontanzauber",
  Sorcery: "Hexereien",
  Artifact: "Artefakte",
  Enchantment: "Verzauberungen",
  Planeswalker: "Planeswalker",
  Battle: "Schlachten",
  Land: "Länder",
};

export function typeDistribution(cards: Array<{ type_line: string | null; is_commander: boolean }>) {
  const counts = new Map<(typeof TYPE_ORDER)[number], number>();
  for (const card of cards) {
    if (card.is_commander) continue;
    const front = (card.type_line ?? "").split(" // ")[0];
    // Artefakt-Kreaturen zählen als Kreatur, Land-Kreaturen als Land.
    const type = isLand(card) ? "Land" : TYPE_ORDER.find((t) => front.includes(t));
    if (type) counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return TYPE_ORDER.filter((t) => counts.has(t)).map((t) => ({ type: t, label: TYPE_LABEL[t], count: counts.get(t)! }));
}
