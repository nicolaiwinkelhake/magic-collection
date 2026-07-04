import { describe, it, expect } from "vitest";
import { detectCombos, formatCombo } from "@/lib/combos";
import { analyzeBracket } from "@/lib/bracket";

describe("detectCombos", () => {
  it("findet eine Combo nur, wenn beide Teile im Deck sind", () => {
    expect(detectCombos(["Thassa's Oracle"])).toHaveLength(0);
    expect(
      detectCombos(["Thassa's Oracle", "Demonic Consultation"])
    ).toHaveLength(1);
  });

  it("ist unabhängig von Groß-/Kleinschreibung", () => {
    expect(
      detectCombos(["thassa's oracle", "DEMONIC CONSULTATION"])
    ).toHaveLength(1);
  });

  it("liefert keine falschen Treffer bei harmlosen Decks", () => {
    expect(detectCombos(["Sol Ring", "Cultivate", "Llanowar Elves"])).toHaveLength(0);
  });

  it("findet mehrere Combos gleichzeitig", () => {
    const found = detectCombos([
      "Exquisite Blood",
      "Sanguine Bond",
      "Isochron Scepter",
      "Dramatic Reversal",
    ]);
    expect(found).toHaveLength(2);
  });

  it("formatCombo gibt lesbare Paare aus", () => {
    expect(formatCombo({ a: "A", b: "B" })).toBe("A + B");
  });
});

describe("Bracket-Integration", () => {
  const card = (name: string) => ({
    name,
    type_line: "Creature",
    oracle_text: "",
    is_commander: false,
  });

  it("Combo ohne Game Changer hebt auf mindestens Bracket 3", () => {
    const res = analyzeBracket(
      [card("Exquisite Blood"), card("Sanguine Bond")],
      [] // keine Game Changer
    );
    expect(res.bracket).toBeGreaterThanOrEqual(3);
    expect(res.signals.twoCardCombo).toBe(true);
  });

  it("ohne Combo bleibt twoCardCombo false", () => {
    const res = analyzeBracket([card("Sol Ring")], []);
    expect(res.signals.twoCardCombo).toBe(false);
  });
});
