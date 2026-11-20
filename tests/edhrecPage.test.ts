import { describe, expect, it } from "vitest";
import { compactFullPage, normalizeSub } from "@/lib/edhrecPage";
import type { RawPage } from "@/lib/edhrec";

const view = (name: string, num: number, pot: number, synergy = 0) => ({ name, num_decks: num, potential_decks: pot, synergy });

const raw = {
  container: {
    json_dict: {
      card: { num_decks: 1000, rank: 4, salt: 1.7713 },
      cardlists: [
        { tag: "newcards", header: "New Cards", cardviews: [view("Neu", 50, 400, 0.4)] },
        { tag: "topcards", header: "Top Cards", cardviews: [view("Sol Ring", 900, 1000, -0.0176), view("Doubling Season", 600, 1000, 0.31)] },
        { tag: "creatures", header: "Creatures", cardviews: [view("Flux Channeler", 500, 1000, 0.17), view("Exot", 20, 1000, 0.8), view("Flux Channeler", 500, 1000, 0.17)] },
        { tag: "lands", header: "Lands", cardviews: [view("Forest", 950, 1000, 0.1), view("Snow-Covered Island", 100, 1000), view("Command Tower", 800, 1000, 0.02)] },
        { tag: "somethingnew", header: "Etwas Neues", cardviews: [view("Karte X", 10, 100)] },
      ],
    },
  },
  panels: {
    mana_curve: { "0": 1, "1": 8, "2": 18, "7": 1, "9": 2 },
    taglinks: [
      { slug: "infect", value: "Infect", count: 3421 },
      { slug: "proliferate", value: "Proliferate", count: 1523 },
      { slug: "planeswalkers", value: "Planeswalkers", count: 1709 },
    ],
  },
  bracket_counts: { "2": 3120, "4": 2615, "3": 4192, "1": 156, "5": 192 },
  budget_counts: { budget: 4639, middle: 37116, expensive: 4639 },
  similar: ["Atraxa, Grand Unifier", { name: "Ixhel" }],
  creature: 24,
  land: 36,
  instant: 10,
  battle: 0,
} as unknown as RawPage;

describe("edhrecPage", () => {
  const page = compactFullPage(raw, "atraxa", "");

  it("übernimmt Kopfdaten", () => {
    expect(page.numDecks).toBe(1000);
    expect(page.rank).toBe(4);
    expect(page.salt).toBe(1.8);
  });

  it("behält Reihenfolge und deutsche Namen der Listen, unbekannte mit EDHREC-Titel", () => {
    expect(page.sections.map((s) => s.key)).toEqual(["newcards", "highsynergycards", "topcards", "creatures", "lands", "somethingnew"]);
    expect(page.sections.find((s) => s.key === "creatures")!.label).toBe("Kreaturen");
    expect(page.sections.find((s) => s.key === "somethingnew")!.label).toBe("Etwas Neues");
  });

  it("rechnet Anteil und Synergie, ohne Dubletten", () => {
    const creatures = page.sections.find((s) => s.key === "creatures")!.cards;
    expect(creatures.map((c) => c.name)).toEqual(["Flux Channeler", "Exot"]);
    expect(creatures[0]).toEqual({ name: "Flux Channeler", inclusion: 0.5, synergy: 0.17 });
  });

  it("lässt Grundländer weg, Nicht-Grundländer bleiben", () => {
    const lands = page.sections.find((s) => s.key === "lands")!.cards.map((c) => c.name);
    expect(lands).toEqual(["Command Tower"]);
  });

  it("leitet „Hohe Synergie“ ab: nur ab 10 % Anteil, höchste Synergie zuerst, ohne neue Karten und Länder", () => {
    const high = page.sections.find((s) => s.key === "highsynergycards")!.cards.map((c) => c.name);
    expect(high).toEqual(["Doubling Season", "Flux Channeler"]);
  });

  it("nutzt eine eigene Synergie-Liste von EDHREC, wenn es sie gibt", () => {
    const own = compactFullPage(
      { container: { json_dict: { cardlists: [{ tag: "highsynergycards", header: "x", cardviews: [view("A", 10, 100, 0.5)] }, { tag: "creatures", cardviews: [view("B", 90, 100, 0.9)] }] } } } as unknown as RawPage,
      "x",
    );
    expect(own.sections.map((s) => s.key)).toEqual(["highsynergycards", "creatures"]);
    expect(own.sections[0].cards.map((c) => c.name)).toEqual(["A"]);
  });

  it("verdichtet die Mana-Kurve auf 0 bis 7+", () => {
    expect(page.curve).toEqual([1, 8, 18, 0, 0, 0, 0, 3]);
  });

  it("gibt Typen mit Wert, Brackets und Preisklassen zurück", () => {
    expect(page.types).toEqual([
      { key: "creature", label: "Kreaturen", value: 24 },
      { key: "instant", label: "Spontanzauber", value: 10 },
      { key: "land", label: "Länder", value: 36 },
    ]);
    expect(page.brackets).toEqual([156, 3120, 4192, 2615, 192]);
    expect(page.budget).toEqual({ budget: 4639, middle: 37116, expensive: 4639 });
  });

  it("sortiert Themen nach Häufigkeit und akzeptiert Ähnliche als Text oder Objekt", () => {
    expect(page.themes.map((t) => t.slug)).toEqual(["infect", "planeswalkers", "proliferate"]);
    expect(page.similar).toEqual(["Atraxa, Grand Unifier", "Ixhel"]);
  });

  it("kommt mit einer leeren Seite klar", () => {
    const empty = compactFullPage({} as RawPage, "leer");
    expect(empty).toMatchObject({ numDecks: 0, rank: null, sections: [], themes: [], brackets: [0, 0, 0, 0, 0], budget: null });
  });

  it("normalisiert Unterseiten", () => {
    expect(normalizeSub("Budget")).toBe("budget");
    expect(normalizeSub(" expensive ")).toBe("expensive");
    expect(normalizeSub("+1/+1 Counters")).toBe("1-1-counters");
    expect(normalizeSub("../etc")).toBe("etc");
    expect(normalizeSub(null)).toBe("");
  });
});
