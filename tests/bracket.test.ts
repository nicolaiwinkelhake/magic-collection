import { describe, it, expect } from "vitest";
import { analyzeBracket, type BracketCardLike } from "@/lib/bracket";

function card(partial: Partial<BracketCardLike>): BracketCardLike {
  return {
    name: partial.name ?? "Test",
    type_line: partial.type_line ?? "Creature",
    oracle_text: partial.oracle_text ?? "",
    is_commander: partial.is_commander ?? false,
  };
}

// Beispiel-Game-Changer-Liste (wird real von Scryfall geladen)
const GC = ["Rhystic Study", "Cyclonic Rift", "Demonic Tutor", "Smothering Tithe"];

describe("analyzeBracket", () => {
  it("ohne Game Changer → Bracket 2 (casual)", () => {
    const res = analyzeBracket([card({ name: "Llanowar Elves" })], GC);
    expect(res.bracket).toBe(2);
    expect(res.gameChangers).toHaveLength(0);
  });

  it("1–3 Game Changer → Bracket 3", () => {
    const res = analyzeBracket(
      [card({ name: "Rhystic Study" }), card({ name: "Cyclonic Rift" })],
      GC
    );
    expect(res.bracket).toBe(3);
    expect(res.gameChangers).toEqual(["Rhystic Study", "Cyclonic Rift"]);
  });

  it("4+ Game Changer → Bracket 4", () => {
    const res = analyzeBracket(
      GC.map((name) => card({ name })),
      GC
    );
    expect(res.bracket).toBe(4);
    expect(res.signals.gameChangerCount).toBe(4);
  });

  it("Massen-Landzerstörung erzwingt mindestens Bracket 4", () => {
    const res = analyzeBracket(
      [card({ name: "Armageddon", oracle_text: "Destroy all lands." })],
      GC
    );
    expect(res.bracket).toBe(4);
    expect(res.signals.massLandDenial).toContain("Armageddon");
  });

  it("erkennt Game Changer unabhängig von Groß-/Kleinschreibung", () => {
    const res = analyzeBracket([card({ name: "rhystic study" })], GC);
    expect(res.gameChangers).toEqual(["rhystic study"]);
    expect(res.bracket).toBe(3);
  });

  it("liefert immer eine Begründung", () => {
    const res = analyzeBracket([card({ name: "Forest", type_line: "Basic Land" })], GC);
    expect(res.reasons.length).toBeGreaterThan(0);
  });
});
