import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, filterAndSortCards, setCodes } from "@/lib/cardFilters";

const c = (name: string, o: Partial<Record<string, unknown>> = {}) => ({
  name,
  name_de: null as string | null,
  rarity: "common",
  set_code: "abc",
  type_line: "Instant",
  colors: [] as string[],
  cmc: 1,
  foil: false,
  price_eur: 1,
  price_eur_foil: null as number | null,
  ...o,
});

describe("filterAndSortCards", () => {
  const cards = [
    c("Lightning Bolt", { colors: ["R"], rarity: "uncommon", price_eur: 2, name_de: "Blitzschlag" }),
    c("Sol Ring", { type_line: "Artifact", set_code: "c21", price_eur: 3 }),
    c("Counterspell", { colors: ["U"], cmc: 2, price_eur: 1.5 }),
    c("Atraxa", { colors: ["W", "U", "B", "G"], rarity: "mythic", type_line: "Legendary Creature", price_eur: 9 }),
  ];

  it("sortiert nach Farbe (WUBRG, mehrfarbig, farblos)", () => {
    expect(filterAndSortCards(cards, DEFAULT_FILTERS).map((x) => x.name)).toEqual(["Counterspell", "Lightning Bolt", "Atraxa", "Sol Ring"]);
  });

  it("sucht deutsch und englisch, filtert Farbe, Seltenheit, Typ, Set", () => {
    expect(filterAndSortCards(cards, { ...DEFAULT_FILTERS, search: "blitz" }).map((x) => x.name)).toEqual(["Lightning Bolt"]);
    expect(filterAndSortCards(cards, { ...DEFAULT_FILTERS, colors: ["U"] }).map((x) => x.name)).toEqual(["Counterspell", "Atraxa"]);
    expect(filterAndSortCards(cards, { ...DEFAULT_FILTERS, rarity: "mythic" })).toHaveLength(1);
    expect(filterAndSortCards(cards, { ...DEFAULT_FILTERS, type: "creature" })[0].name).toBe("Atraxa");
    expect(filterAndSortCards(cards, { ...DEFAULT_FILTERS, set: "c21" })[0].name).toBe("Sol Ring");
  });

  it("sortiert nach Preis absteigend und Name", () => {
    expect(filterAndSortCards(cards, { ...DEFAULT_FILTERS, sort: "price" })[0].name).toBe("Atraxa");
    expect(filterAndSortCards(cards, { ...DEFAULT_FILTERS, sort: "name" })[0].name).toBe("Atraxa");
  });

  it("liefert die Set-Kürzel", () => {
    expect(setCodes(cards)).toEqual(["abc", "c21"]);
  });
});
