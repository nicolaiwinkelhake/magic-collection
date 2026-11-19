// Standarddruck einer Karte wählen (rein, getestet) – möglichst derselbe,
// den Scryfall bei einer reinen Namenssuche liefert: der neueste "normale"
// Druck (keine Promo, kein Showcase/Extended Art, kein Sonder-Set, keine
// Variante); nur wenn es keinen solchen gibt, der neueste überhaupt.

export type PickRow = {
  released_at: string | null;
  collector_number: string;
  promo?: boolean | null;
  set_type?: string | null;
  frame_effects?: string[] | null;
  border_color?: string | null;
  full_art?: boolean | null;
  variation?: boolean | null;
  oversized?: boolean | null;
  textless?: boolean | null;
  lang?: string | null;
  type_line?: string | null;
};

const SPECIAL_SETS = new Set(["memorabilia", "token", "funny", "minigame", "alchemy", "treasure_chest", "vanguard", "planechase", "archenemy"]);
const SPECIAL_FRAMES = ["showcase", "extendedart", "etched", "inverted", "borderless", "fullart"];

/** Wie "normal" ist ein Druck? Höher = eher Standarddruck. */
export function normalScore(r: PickRow): number {
  let s = 0;
  if (!r.promo) s += 8;
  if (!r.set_type || !SPECIAL_SETS.has(r.set_type)) s += 8;
  if (!r.variation && !r.oversized && !r.textless) s += 4;
  if (!(r.frame_effects ?? []).some((f) => SPECIAL_FRAMES.includes(f))) s += 2;
  if (r.border_color === "black" || r.border_color === "white") s += 1;
  const basic = /\bBasic\b/.test(r.type_line ?? "");
  if (!r.full_art || basic) s += 1;
  if (!r.lang || r.lang === "en") s += 1;
  return s;
}

const num = (n: string) => parseInt(n.replace(/\D+/g, ""), 10) || 0;

export function pickDefaultPrint<T extends PickRow>(rows: T[]): T | null {
  if (!rows.length) return null;
  return [...rows].sort(
    (a, b) =>
      normalScore(b) - normalScore(a) ||
      (b.released_at ?? "").localeCompare(a.released_at ?? "") ||
      num(a.collector_number) - num(b.collector_number),
  )[0];
}
