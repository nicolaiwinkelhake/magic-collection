import { describe, expect, it } from "vitest";
import { commanderSlug, compactCommanderPage, edhrecSlug } from "@/lib/edhrec";

describe("edhrec", () => {
  it("baut Seitennamen wie EDHREC", () => {
    expect(edhrecSlug("Korvold, Fae-Cursed King")).toBe("korvold-fae-cursed-king");
    expect(edhrecSlug("Atraxa, Praetors' Voice")).toBe("atraxa-praetors-voice");
    expect(edhrecSlug("Lim-Dûl the Necromancer")).toBe("lim-dul-the-necromancer");
    expect(edhrecSlug("Esika, God of the Tree // The Prismatic Bridge")).toBe("esika-god-of-the-tree");
    expect(commanderSlug(["Tymna the Weaver", "Kraum, Ludevic's Opus"])).toBe("kraum-ludevics-opus-tymna-the-weaver");
  });

  it("verdichtet die Seite: Anteil, Synergie, spezifische Liste gewinnt", () => {
    const page = compactCommanderPage(
      {
        container: {
          json_dict: {
            card: { name: "Korvold", num_decks: 1000 },
            cardlists: [
              { tag: "newcards", cardviews: [{ name: "Neu", num_decks: 1, potential_decks: 2 }] },
              { tag: "topcards", cardviews: [{ name: "Sol Ring", synergy: 0.01, lift: 1.1, num_decks: 900, potential_decks: 1000 }] },
              { tag: "manaartifacts", cardviews: [{ name: "Sol Ring", synergy: 0.01, lift: 1.1, num_decks: 900, potential_decks: 1000 }] },
              { tag: "creatures", cardviews: [{ name: "Mayhem Devil", synergy: 0.47, lift: 2.7, num_decks: 750, potential_decks: 1000 }] },
            ],
          },
        },
        tag_counts: [{ slug: "sacrifice", value: "Sacrifice", count: 99 }],
        land: 36,
        creature: 29,
        similar: ["Prossh"],
      },
      "korvold-fae-cursed-king",
    );
    expect(page.numDecks).toBe(1000);
    expect(page.cards.map((c) => [c.name, c.list, c.inclusion])).toEqual([
      ["Sol Ring", "manaartifacts", 0.9],
      ["Mayhem Devil", "creatures", 0.75],
    ]);
    expect(page.themes[0]).toEqual({ slug: "sacrifice", name: "Sacrifice", count: 99 });
    expect(page.types).toEqual({ creature: 29, land: 36 });
  });
});
