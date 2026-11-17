import { describe, expect, it } from "vitest";
import { landPlan, manaBase, nextSteps, overallScore } from "@/lib/deckPlan";
import type { DeckHealth, DoctorDeckCard } from "@/lib/deckDoctor";
import type { DeckSynergy } from "@/lib/deckSynergy";

const spell = (name: string, mana: string): DoctorDeckCard => ({ name, type_line: "Creature", cmc: 3, is_commander: false, mana_cost: mana });
const land = (name: string, type: string, made?: string[]): DoctorDeckCard => ({ name, type_line: type, cmc: 0, is_commander: false, produced_mana: made });

describe("Manabasis", () => {
  const deck = [
    ...Array.from({ length: 12 }, (_, i) => spell(`R${i}`, "{1}{R}{R}")),
    ...Array.from({ length: 6 }, (_, i) => spell(`G${i}`, "{2}{G}")),
    spell("Hybrid", "{R/G}"),
    ...Array.from({ length: 20 }, (_, i) => land(`Forest ${i}`, "Basic Land — Forest")),
    ...Array.from({ length: 3 }, (_, i) => land(`Mountain ${i}`, "Basic Land — Mountain")),
    land("Taiga-artig", "Land", ["R", "G"]),
  ];
  it("zählt Farbsymbole und Quellen", () => {
    const m = manaBase(deck, ["R", "G"]);
    const r = m.colors.find((c) => c.color === "R")!;
    const g = m.colors.find((c) => c.color === "G")!;
    expect(m.lands).toBe(24);
    expect(r.pips).toBe(25); // 24 + ½ (gerundet)
    expect(r.sources).toBe(4);
    expect(g.sources).toBe(21);
    expect(r.ok).toBe(false);
    expect(g.ok).toBe(true);
    expect(m.issues[0]).toMatch(/Rot: 4 Quellen/);
  });
  it("verteilt fehlende Länder nach Farbanteil", () => {
    const m = manaBase(deck, ["R", "G"]);
    const plan = landPlan(m, 37, 3);
    expect(plan.missing).toBe(13);
    expect(plan.basics.reduce((s, b) => s + b.count, 0)).toBe(10);
    expect(plan.basics[0]).toMatchObject({ name: "Mountain" });
    expect(plan.basics[0].count).toBeGreaterThan(plan.basics[1].count);
  });
  it("meldet bei sehr wenigen Ländern keine Farbprobleme (erst Länder ergänzen)", () => {
    expect(manaBase([spell("x", "{R}"), land("Forest", "Basic Land — Forest")], ["R", "G"]).issues).toEqual([]);
  });
});

describe("Fazit", () => {
  const health = {
    cards: 80, lands: 20, avgCmc: 3.9, curve: [], score: 40, notes: [], unknownRoles: 0,
    checks: [
      { key: "lands", label: "Länder", have: 20, target: 37, min: 34, ok: false },
      { key: "ramp", label: "Ramp", have: 3, target: 10, min: 8, ok: false },
      { key: "draw", label: "Kartenvorteil", have: 9, target: 10, min: 8, ok: true },
      { key: "removal", label: "Removal", have: 8, target: 8, min: 6, ok: true },
    ],
  } as DeckHealth;
  const mana = { lands: 20, colors: [], issues: [] };
  it("nennt die wichtigsten Schritte zuerst", () => {
    const steps = nextSteps({ health, mana, synergy: null, swaps: 5, landTarget: 37 });
    expect(steps).toHaveLength(3);
    expect(steps[0]).toMatchObject({ key: "lands", title: "17 Länder fehlen", tab: "geruest" });
    expect(steps[1]).toMatchObject({ key: "ramp", tab: "tausche" });
    expect(steps.map((s) => s.key)).not.toContain("removal");
  });
  it("bei rundem Deck bleibt der Feinschliff", () => {
    const fine = { ...health, cards: 99, avgCmc: 3, checks: health.checks.map((c) => ({ ...c, have: c.target, ok: true })) } as DeckHealth;
    expect(nextSteps({ health: fine, mana, synergy: null, swaps: 4, landTarget: 37 })[0]).toMatchObject({ key: "polish" });
  });
  it("Gesamtnote mischt Gerüst und Stimmigkeit", () => {
    expect(overallScore(health, null)).toBe(40);
    expect(overallScore(health, { score: 80 } as DeckSynergy)).toBe(56);
  });
});
