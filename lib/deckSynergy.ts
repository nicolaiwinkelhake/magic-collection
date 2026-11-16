// Wie stimmig ist ein Deck? (rein, getestet)
// 1) Strategie: Welcher EDHREC-Schwerpunkt des Commanders (z. B. "Dragons")
//    passt am besten zum Deck? – Je Thema gibt es eine eigene Statistik.
// 2) Synergie-Wert: Wie viele Deckkarten sind für diesen Commander/diese
//    Strategie typisch, wie hoch ist ihre Synergie, wer fällt raus?
// 3) Zusammenspiel Karte↔Karte: Mit welchen Deckkarten wird eine Karte laut
//    EDHREC deutlich häufiger zusammen gespielt als zufällig (Lift)?
import { isLand } from "@/lib/cardRoles";
import { themeFit, type DoctorDeckCard } from "@/lib/deckDoctor";
import type { EdhrecCard, EdhrecPairs } from "@/lib/edhrec";

const BASICS = /^(Plains|Island|Swamp|Mountain|Forest|Wastes|Snow-Covered .+)$/;

/** Karten, die für Stimmigkeit zählen: ohne Commander, Länder, Standardländer */
export function relevantCards(deck: DoctorDeckCard[]): DoctorDeckCard[] {
  return deck.filter((c) => !c.is_commander && !isLand(c) && !BASICS.test(c.name));
}

export type StrategyFit = { slug: string; name: string; fit: number; numDecks: number };

/**
 * Wie typisch ist das Deck für eine Statistik? Durchschnittlicher Anteil der
 * Decks (dieser Strategie), die die jeweilige Deckkarte auch spielen.
 */
export function strategyFit(deck: DoctorDeckCard[], cards: EdhrecCard[]): number {
  const rel = relevantCards(deck);
  if (!rel.length) return 0;
  const inc = new Map(cards.map((c) => [c.name, c.inclusion]));
  const sum = rel.reduce((s, c) => s + (inc.get(c.name) ?? 0), 0);
  return Math.round((sum / rel.length) * 1000) / 1000;
}

/** Beste Strategie; "Allgemein" (slug "") nur, wenn kein Thema klar besser passt. */
export function pickStrategy(fits: StrategyFit[]): StrategyFit | null {
  if (!fits.length) return null;
  const general = fits.find((f) => f.slug === "");
  const themed = fits.filter((f) => f.slug !== "" && f.numDecks >= 50).sort((a, b) => b.fit - a.fit)[0];
  if (!general) return themed ?? fits[0];
  // Thema nur wählen, wenn das Deck dort deutlich typischer ist
  return themed && themed.fit >= general.fit * 1.1 + 0.01 ? themed : general;
}

export type DeckSynergy = {
  /** Deckkarten (ohne Länder/Commander) */
  total: number;
  /** davon in der EDHREC-Liste */
  listed: number;
  /** Ø Synergie der gelisteten Karten (−1…1) */
  avgSynergy: number;
  /** Anteil mit spürbarer Synergie (≥ 10 %) */
  highSynergy: number;
  /** 0–100: Mischung aus Anteil gelistet und Synergie */
  score: number;
  /** Karten, die am wenigsten passen (nicht gelistet oder negative Synergie) */
  outliers: Array<{ name: string; synergy: number | null }>;
  /** Wie viele Karten tragen die Themen des Commanders? */
  themes: Array<{ name: string; count: number }>;
};

export function deckSynergy(deck: DoctorDeckCard[], cards: EdhrecCard[], themes: string[]): DeckSynergy {
  const rel = relevantCards(deck);
  const byName = new Map(cards.map((c) => [c.name, c]));
  const listed = rel.filter((c) => byName.has(c.name));
  const syn = listed.map((c) => byName.get(c.name)!.synergy);
  const avgSynergy = syn.length ? Math.round((syn.reduce((a, b) => a + b, 0) / syn.length) * 1000) / 1000 : 0;
  const highSynergy = syn.filter((x) => x >= 0.1).length;
  const share = rel.length ? listed.length / rel.length : 0;
  // 70 % "spielen andere das auch?", 30 % "wie gezielt für diesen Commander?"
  const score = Math.round(Math.max(0, Math.min(1, share * 0.7 + Math.min(1, Math.max(0, avgSynergy) / 0.3) * 0.3)) * 100);
  const outliers = rel
    .map((c) => ({ name: c.name, synergy: byName.get(c.name)?.synergy ?? null }))
    .filter((o) => o.synergy == null || o.synergy < 0)
    .sort((a, b) => (a.synergy ?? -2) - (b.synergy ?? -2))
    .slice(0, 12);
  const themeCounts = themes.map((t) => ({ name: t, count: rel.filter((c) => themeFit([t], c.type_line, c.oracle_text).length > 0).length }));
  return { total: rel.length, listed: listed.length, avgSynergy, highSynergy, score, outliers, themes: themeCounts };
}

export type PairFit = {
  /** EDHREC kennt die Karte (Kartenseite vorhanden) */
  known: boolean;
  /** Deckkarten, mit denen sie deutlich öfter zusammen gespielt wird */
  partners: Array<{ name: string; lift: number }>;
};

/** Ab diesem Lift gilt "spielt man auffällig oft zusammen" */
export const PAIR_LIFT = 1.5;

export function pairFit(pairs: EdhrecPairs | null, deckNames: Iterable<string>, exclude: string[] = []): PairFit {
  if (!pairs) return { known: false, partners: [] };
  const names = new Set(deckNames);
  for (const e of exclude) names.delete(e);
  return {
    known: true,
    partners: pairs.partners.filter((p) => p.lift >= PAIR_LIFT && names.has(p.name)).sort((a, b) => b.lift - a.lift),
  };
}
