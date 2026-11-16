// Deck-Analyse – was über einzelne Tausche hinausgeht (rein, getestet):
// - Manabasis: Passen die Farben der Länder zu den Farben der Zauber?
// - Länder: Wie viele fehlen, welche Standardländer, welche typischen Länder?
// - Fazit: die wichtigsten nächsten Schritte, nach Wirkung sortiert.
import { isLand } from "@/lib/cardRoles";
import type { DeckHealth, DoctorDeckCard } from "@/lib/deckDoctor";
import type { DeckSynergy } from "@/lib/deckSynergy";

export const COLORS = ["W", "U", "B", "R", "G"] as const;
export type Color = (typeof COLORS)[number];
export const COLOR_NAME: Record<Color, string> = { W: "Weiß", U: "Blau", B: "Schwarz", R: "Rot", G: "Grün" };
export const BASIC_LAND: Record<Color, string> = { W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest" };
const BASIC_TYPE: Record<string, Color> = { plains: "W", island: "U", swamp: "B", mountain: "R", forest: "G" };

export type ColorCheck = {
  color: Color;
  /** farbige Manasymbole in den Kosten der Zauber */
  pips: number;
  /** Anteil an allen farbigen Symbolen (0–1) */
  need: number;
  /** Länder, die diese Farbe erzeugen */
  sources: number;
  /** Richtwert: so viele Quellen sollten es sein */
  wanted: number;
  ok: boolean;
};

export type ManaBase = { lands: number; colors: ColorCheck[]; issues: string[] };

/** Welche Farben erzeugt ein Land? (produced_mana, sonst über Standardland-Typen) */
function landColors(c: DoctorDeckCard): Color[] {
  const made = (c.produced_mana ?? []).filter((x): x is Color => (COLORS as readonly string[]).includes(x));
  if (made.length) return Array.from(new Set(made));
  const type = (c.type_line ?? "").toLowerCase();
  return Object.entries(BASIC_TYPE)
    .filter(([word]) => type.includes(word))
    .map(([, col]) => col);
}

/**
 * Farb-Check: Anteil der farbigen Symbole je Farbe gegen die Zahl der
 * Länder, die sie erzeugen. Richtwert: Quellen ≈ Anteil × Länder, bei einer
 * Farbe mit nennenswertem Anteil aber mindestens ein fester Sockel –
 * sonst zieht man sie zu selten.
 */
export function manaBase(deck: DoctorDeckCard[], identity: string[]): ManaBase {
  const main = deck.filter((c) => !c.is_commander);
  const lands = main.filter((c) => isLand(c));
  const pips: Record<Color, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const c of deck) {
    if (isLand(c)) continue;
    for (const m of (c.mana_cost ?? "").matchAll(/\{([^}]+)\}/g)) {
      // Hybrid {W/U} zählt für beide zur Hälfte
      const cols = m[1].split("/").filter((x): x is Color => (COLORS as readonly string[]).includes(x));
      for (const col of cols) pips[col] += 1 / cols.length;
    }
  }
  const total = COLORS.reduce((s, c) => s + pips[c], 0);
  const sources: Record<Color, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const l of lands) for (const col of landColors(l)) sources[col] += 1;
  const landCount = Math.max(lands.length, 1);
  const colors: ColorCheck[] = COLORS.filter((c) => identity.includes(c) || pips[c] > 0).map((color) => {
    const need = total ? pips[color] / total : 0;
    const floor = need >= 0.25 ? 10 : need >= 0.1 ? 7 : need > 0 ? 4 : 0;
    const wanted = Math.max(floor, Math.round(need * Math.max(landCount, 34)));
    return { color, pips: Math.round(pips[color]), need: Math.round(need * 100) / 100, sources: sources[color], wanted, ok: sources[color] >= Math.round(wanted * 0.8) };
  });
  const issues = lands.length >= 20 ? colors.filter((c) => !c.ok).map((c) => `${COLOR_NAME[c.color]}: ${c.sources} Quellen, Richtwert ${c.wanted}`) : [];
  return { lands: lands.length, colors, issues };
}

export type LandPlan = {
  missing: number;
  /** Standardländer nach Farbanteil, falls Länder fehlen */
  basics: Array<{ name: string; color: Color; count: number }>;
};

/** Fehlende Länder auf Standardländer verteilen (nach Anteil der Farbsymbole). */
export function landPlan(base: ManaBase, target: number, reserveForUtility = 0): LandPlan {
  const missing = Math.max(0, target - base.lands);
  const toBasics = Math.max(0, missing - reserveForUtility);
  const active = base.colors.filter((c) => c.need > 0);
  if (!toBasics || !active.length) return { missing, basics: [] };
  const sum = active.reduce((s, c) => s + c.need, 0);
  const raw = active.map((c) => ({ c, exact: (c.need / sum) * toBasics }));
  const basics = raw.map((r) => ({ name: BASIC_LAND[r.c.color], color: r.c.color, count: Math.floor(r.exact), rest: r.exact - Math.floor(r.exact) }));
  let left = toBasics - basics.reduce((s, b) => s + b.count, 0);
  for (const b of [...basics].sort((a, z) => z.rest - a.rest)) {
    if (left-- <= 0) break;
    b.count += 1;
  }
  return { missing, basics: basics.filter((b) => b.count > 0).map(({ name, color, count }) => ({ name, color, count })) };
}

export type StepTab = "geruest" | "tausche" | "stimmigkeit";
export type Step = { key: string; title: string; detail: string; tab: StepTab; weight: number };

/** Gesamtnote: Gerüst zählt etwas mehr als Stimmigkeit (ohne EDHREC nur das Gerüst). */
export function overallScore(health: DeckHealth, synergy: DeckSynergy | null): number {
  return synergy ? Math.round(health.score * 0.6 + synergy.score * 0.4) : health.score;
}

/**
 * Die wichtigsten nächsten Schritte, größte Wirkung zuerst. Jeder Schritt
 * verweist auf den Reiter, in dem die passenden Vorschläge stehen.
 */
export function nextSteps(input: { health: DeckHealth; mana: ManaBase; synergy: DeckSynergy | null; swaps: number; landTarget: number }, max = 3): Step[] {
  const { health, mana, synergy } = input;
  const steps: Step[] = [];
  const lands = health.checks.find((c) => c.key === "lands");
  if (lands && lands.have < lands.min) {
    const n = input.landTarget - lands.have;
    steps.push({ key: "lands", title: `${n} Länder fehlen`, detail: `${lands.have} von ${input.landTarget} – ohne genug Länder kommt das Deck nicht ins Spiel.`, tab: "geruest", weight: 100 + n * 3 });
  } else if (lands && lands.have > 40) {
    steps.push({ key: "lands", title: `${lands.have - input.landTarget} Länder zu viel`, detail: `${lands.have} Länder – ${input.landTarget} reichen meist; Platz für Zauber.`, tab: "geruest", weight: 30 });
  }
  for (const c of health.checks) {
    if (c.key === "lands" || c.have >= c.target) continue;
    const gap = c.target - c.have;
    steps.push({
      key: c.key,
      title: `${c.label}: ${gap} ${gap === 1 ? "Karte fehlt" : "Karten fehlen"}`,
      detail: `${c.have} von ${c.target}${c.ok ? " – knapp, aber spielbar" : ""}. Passende Karten stehen im Reiter „Karten“.`,
      tab: "tausche",
      weight: (c.ok ? 20 : 60) + (gap / c.target) * 40,
    });
  }
  if (mana.issues.length) steps.push({ key: "colors", title: "Farben der Länder passen nicht", detail: mana.issues.slice(0, 2).join(" · "), tab: "geruest", weight: 55 });
  if (health.avgCmc > 3.6) steps.push({ key: "curve", title: "Manakurve zu hoch", detail: `Ø ${health.avgCmc.toFixed(1).replace(".", ",")} Mana – teure Karten gegen günstigere tauschen.`, tab: "tausche", weight: 45 });
  if (synergy && synergy.total >= 20) {
    const off = synergy.total - synergy.listed;
    if (off / synergy.total > 0.35) steps.push({ key: "synergy", title: `${off} Karten passen nicht zur Strategie`, detail: `Nur ${synergy.listed} von ${synergy.total} Karten spielen andere mit diesem Commander.`, tab: "stimmigkeit", weight: 35 + (off / synergy.total) * 30 });
  }
  if (health.cards < 99) steps.push({ key: "size", title: `${99 - health.cards} Karten fehlen bis 99`, detail: "Das Deck ist noch nicht vollständig.", tab: "tausche", weight: 25 + (99 - health.cards) });
  if (!steps.length && input.swaps > 0) steps.push({ key: "polish", title: `${input.swaps} lohnende Tausche`, detail: "Das Grundgerüst passt – jetzt geht es um Feinschliff.", tab: "tausche", weight: 10 });
  return steps.sort((a, b) => b.weight - a.weight).slice(0, max);
}
