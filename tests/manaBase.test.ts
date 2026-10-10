import { describe, it, expect } from "vitest";
import { analyzeManaBase, countPips, typeDistribution } from "@/lib/manaBase";
import { analyzeBracket } from "@/lib/bracket";

describe("countPips", () => {
  it("zählt Farbsymbole, Hybrid halb, Phyrexianisch voll", () => {
    expect(countPips("{2}{B}{B}{G}")).toEqual({ W: 0, U: 0, B: 2, R: 0, G: 1 });
    expect(countPips("{W/U}{B/P}")).toEqual({ W: 0.5, U: 0.5, B: 1, R: 0, G: 0 });
    expect(countPips(null)).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0 });
  });
});

const land = (name: string, produced: string[]) => ({
  name,
  type_line: "Land",
  mana_cost: null,
  produced_mana: produced,
  is_commander: false,
});
const spell = (name: string, cost: string) => ({
  name,
  type_line: "Creature",
  mana_cost: cost,
  produced_mana: [],
  is_commander: false,
});

describe("analyzeManaBase", () => {
  it("vergleicht Symbol- und Quellenanteile und warnt bei zu wenig Quellen", () => {
    const cards = [
      ...Array.from({ length: 30 }, (_, i) => land(`Swamp ${i}`, ["B"])),
      ...Array.from({ length: 5 }, (_, i) => land(`Forest ${i}`, ["G"])),
      spell("A", "{B}{B}"),
      spell("B", "{G}{G}"),
      spell("C", "{G}"),
    ];
    const r = analyzeManaBase(cards);
    expect(r.lands).toBe(35);
    const green = r.colors.find((c) => c.color === "G")!;
    expect(green.pips).toBe(3);
    expect(green.landSources).toBe(5);
    expect(green.status).toBe("low");
    expect(r.warnings.some((w) => w.startsWith("Grün"))).toBe(true);
    expect(r.colors.find((c) => c.color === "B")!.status).toBe("ok");
  });

  it("zählt Commander-Kosten mit, aber nicht als Quelle", () => {
    const r = analyzeManaBase([{ ...spell("Meren", "{2}{B}{G}"), is_commander: true, produced_mana: ["B"] }]);
    expect(r.colors.map((c) => [c.color, c.pips, c.landSources])).toEqual([
      ["B", 1, 0],
      ["G", 1, 0],
    ]);
  });
});

describe("typeDistribution", () => {
  it("zählt Haupttypen ohne Commander, MDFC-Zauber nicht als Land", () => {
    const out = typeDistribution([
      { type_line: "Artifact Creature — Golem", is_commander: false },
      { type_line: "Instant // Land", is_commander: false },
      { type_line: "Land", is_commander: false },
      { type_line: "Legendary Creature", is_commander: true },
    ]);
    expect(out.map((t) => [t.type, t.count])).toEqual([
      ["Creature", 1],
      ["Instant", 1],
      ["Land", 1],
    ]);
  });
});

describe("analyzeBracket mit Spellbook-Daten", () => {
  const card = (name: string) => ({ name, type_line: "Sorcery", oracle_text: "", is_commander: false });

  it("nutzt Spellbook-Game-Changer, Extrazüge und Combos", () => {
    const r = analyzeBracket([card("Time Warp"), card("Temporal Manipulation"), card("A"), card("B")], [], {
      extraTurns: ["Time Warp", "Temporal Manipulation"],
      twoCardCombos: [["A", "B"]],
    });
    expect(r.bracket).toBe(3);
    expect(r.signals.extraTurns).toHaveLength(2);
    expect(r.reasons.join(" ")).toContain("A + B");
  });

  it("Massen-Landzerstörung aus Spellbook → Bracket 4", () => {
    expect(analyzeBracket([card("Armageddon")], [], { massLandDenial: ["Armageddon"] }).bracket).toBe(4);
  });
});
