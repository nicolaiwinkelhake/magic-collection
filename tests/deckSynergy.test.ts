import { describe, expect, it } from "vitest";
import { deckSynergy, pairFit, pickStrategy, strategyFit } from "@/lib/deckSynergy";
import { compactCardPage, type EdhrecCard } from "@/lib/edhrec";
import type { DoctorDeckCard } from "@/lib/deckDoctor";

const c = (name: string, type = "Creature — Dragon", oracle = "Flying"): DoctorDeckCard => ({ name, type_line: type, cmc: 3, is_commander: false, oracle_text: oracle });
const e = (name: string, inclusion: number, synergy: number): EdhrecCard => ({ name, inclusion, synergy, lift: 1, list: "creatures" });
const deck = [
  { ...c("Ur"), is_commander: true },
  c("A"), c("B"), c("C", "Instant", "Draw a card"), c("D", "Enchantment", ""),
  c("Forest", "Basic Land — Forest", ""), c("Temple", "Land", ""),
];

describe("Deck-Synergie", () => {
  it("misst Anteil gelistet, Synergie, Ausreißer und Themen", () => {
    const s = deckSynergy(deck, [e("A", 0.8, 0.5), e("B", 0.6, 0.2), e("C", 0.5, -0.1)], ["Dragons", "Flying"]);
    expect(s.total).toBe(4);
    expect(s.listed).toBe(3);
    expect(s.avgSynergy).toBeCloseTo(0.2, 3);
    expect(s.highSynergy).toBe(2);
    expect(s.outliers.map((o) => o.name)).toEqual(["D", "C"]);
    expect(s.themes).toEqual([{ name: "Dragons", count: 2 }, { name: "Flying", count: 2 }]);
    expect(s.score).toBeGreaterThan(50);
  });

  it("wählt das Thema nur, wenn es klar besser passt", () => {
    const gen = { slug: "", name: "Allgemein", fit: strategyFit(deck, [e("A", 0.5, 0), e("B", 0.4, 0)]), numDecks: 5000 };
    const dragons = { slug: "dragons", name: "Dragons", fit: strategyFit(deck, [e("A", 0.9, 0), e("B", 0.8, 0)]), numDecks: 3000 };
    const tiny = { slug: "x", name: "X", fit: 0.99, numDecks: 10 };
    expect(pickStrategy([gen, dragons, tiny])?.slug).toBe("dragons");
    expect(pickStrategy([gen, { ...dragons, fit: gen.fit }])?.slug).toBe("");
  });
});

describe("Zusammenspiel Karte↔Karte", () => {
  it("liest die EDHREC-Kartenseite und findet Partner im Deck", () => {
    const raw = {
      container: {
        json_dict: {
          cardlists: [
            { tag: "topcommanders", cardviews: [{ name: "Ur", lift: 9 }] },
            { tag: "topcards", cardviews: [{ name: "A", lift: 9.6 }, { name: "Crux", lift: 3 }] },
            { tag: "creatures", cardviews: [{ name: "A", lift: 4 }, { name: "B", lift: 1.2 }, { name: "Z", lift: 5 }] },
          ],
        },
      },
    };
    const pairs = compactCardPage(raw, "Crux");
    expect(pairs.partners).toEqual([{ name: "Z", lift: 5 }, { name: "A", lift: 9.6 }, { name: "B", lift: 1.2 }].sort((a, b) => b.lift - a.lift));
    const fit = pairFit(pairs, ["A", "B", "D"], ["D"]);
    expect(fit).toEqual({ known: true, partners: [{ name: "A", lift: 9.6 }] });
    expect(pairFit(null, ["A"])).toEqual({ known: false, partners: [] });
  });
});
