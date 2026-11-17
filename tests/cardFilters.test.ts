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

describe("Suche im Kartentext", () => {
  const list = [
    c("Serra Angel", { type_line: "Creature — Angel", oracle_text: "Flying, vigilance" } as never),
    c("Divination", { type_line: "Sorcery", oracle_text: "Draw two cards." } as never),
    c("Flying Men", { type_line: "Creature — Human", oracle_text: "Flying" } as never),
  ];
  it("ohne Schalter nur im Namen", () => {
    expect(filterAndSortCards(list, { ...DEFAULT_FILTERS, sort: "name", search: "flying" }).map((x) => x.name)).toEqual(["Flying Men"]);
  });
  it("mit Schalter auch in Typzeile und Regeltext, alle Wörter", () => {
    const f = { ...DEFAULT_FILTERS, sort: "name" as const, inText: true };
    expect(filterAndSortCards(list, { ...f, search: "flying" }).map((x) => x.name)).toEqual(["Flying Men", "Serra Angel"]);
    expect(filterAndSortCards(list, { ...f, search: "draw cards" }).map((x) => x.name)).toEqual(["Divination"]);
    expect(filterAndSortCards(list, { ...f, search: "angel vigilance" }).map((x) => x.name)).toEqual(["Serra Angel"]);
    expect(filterAndSortCards(list, { ...f, search: "trample" })).toEqual([]);
  });
});
