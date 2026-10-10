import { describe, it, expect } from "vitest";
import { buildCoachPrompt, validateCoach } from "@/lib/deckCoach";
import { deckToText } from "@/lib/deckExport";

describe("validateCoach", () => {
  const deck = ["Meren", "Grizzly Bears", "Hill Giant", "Sol Ring"];
  const candidates = ["Viscera Seer", "Blood Artist", "Sol Ring"];

  it("lässt nur Deckkarten raus und Kandidaten rein, ohne Commander und Dubletten", () => {
    const out = validateCoach(
      {
        summary: "x",
        swaps: [
          { out: "Grizzly Bears", in: "Viscera Seer", reason: "" },
          { out: "Meren", in: "Blood Artist", reason: "" }, // Commander
          { out: "Hill Giant", in: "Erfundene Karte", reason: "" }, // kein Kandidat
          { out: "Hill Giant", in: "Sol Ring", reason: "" }, // schon im Deck
          { out: "Grizzly Bears", in: "Blood Artist", reason: "" }, // out doppelt
          { out: "Hill Giant", in: "Blood Artist", reason: "" },
        ],
        cuts: [
          { name: "Hill Giant", reason: "" }, // schon getauscht
          { name: "Sol Ring", reason: "" },
          { name: "Gibt es nicht", reason: "" },
        ],
      },
      deck,
      ["Meren"],
      candidates
    );
    expect(out.swaps.map((s) => `${s.out}>${s.in}`)).toEqual(["Grizzly Bears>Viscera Seer", "Hill Giant>Blood Artist"]);
    expect(out.cuts.map((c) => c.name)).toEqual(["Sol Ring"]);
  });
});

describe("buildCoachPrompt", () => {
  it("enthält Modus, Bracket, Deck und Kandidaten", () => {
    const prompt = buildCoachPrompt({
      commander: "Meren",
      commanderText: "Text",
      themes: ["Aristokraten"],
      deck: [{ name: "Grizzly Bears", typeLine: "Creature", cmc: 2, roles: null }],
      roleSummary: "Ramp 3/10",
      candidates: [
        { name: "Viscera Seer", typeLine: "Creature", cmc: 1, eur: 0.3, owned: 1, gameChanger: false, lists: ["Aristokraten"] },
      ],
      mode: "budget",
      budget: 5,
      targetBracket: 2,
    });
    expect(prompt).toContain("höchstens 5 €");
    expect(prompt).toContain("Ziel-Bracket: 2");
    expect(prompt).toContain("- Grizzly Bears | Creature | 2 | -");
    expect(prompt).toContain("- Viscera Seer | Creature | 1 | 0.3 | ja | Aristokraten");
  });
});

describe("deckToText", () => {
  it("gibt Commander-Abschnitt und gezählte, sortierte Karten aus", () => {
    const text = deckToText([
      { name: "Meren", is_commander: true },
      { name: "Swamp", is_commander: false },
      { name: "Swamp", is_commander: false },
      { name: "Animate Dead", is_commander: false },
    ]);
    expect(text).toBe("Commander\n1 Meren\n\nDeck\n1 Animate Dead\n2 Swamp\n");
  });
});
