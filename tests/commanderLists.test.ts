import { describe, it, expect } from "vitest";
import { buildListSpecs, cleanList, filterCards, type ListCard } from "@/lib/commanderLists";
import { commanderSlug, edhrecLinks, edhrecSlug } from "@/lib/edhrecLinks";
import { identityFilter, type CompactCard } from "@/lib/scryfallCache";

const compact = (name: string, extra: Partial<CompactCard> = {}): CompactCard => ({
  id: name,
  name,
  image: null,
  manaCost: null,
  cmc: 2,
  typeLine: "Creature",
  colorIdentity: [],
  eur: 1,
  eurFoil: null,
  edhrecRank: 100,
  gameChanger: false,
  releasedAt: null,
  ...extra,
});
const listCard = (name: string, extra: Partial<ListCard> = {}): ListCard => ({
  ...compact(name),
  owned: 0,
  inDecks: [],
  friends: [],
  groupDecks: 0,
  ...extra,
});

describe("edhrecSlug", () => {
  it("bildet EDHREC-Slugs", () => {
    expect(edhrecSlug("Meren of Clan Nel Toth")).toBe("meren-of-clan-nel-toth");
    expect(edhrecSlug("Atraxa, Praetors' Voice")).toBe("atraxa-praetors-voice");
    expect(edhrecSlug("Lim-Dûl the Necromancer")).toBe("lim-dul-the-necromancer");
    expect(edhrecSlug("Esika, God of the Tree // The Prismatic Bridge")).toBe("esika-god-of-the-tree");
  });

  it("sortiert Partner-Paare alphabetisch", () => {
    expect(commanderSlug("Tymna the Weaver", "Thrasios, Triton Hero")).toBe("thrasios-triton-hero-tymna-the-weaver");
    expect(edhrecLinks("Sol Ring").averageDeck).toBe("https://edhrec.com/average-decks/sol-ring");
  });
});

describe("identityFilter", () => {
  it("baut den Scryfall-Farbfilter", () => {
    expect(identityFilter(["B", "G"])).toBe("id<=bg");
    expect(identityFilter([])).toBe("id<=c");
  });
});

describe("buildListSpecs", () => {
  it("enthält neue Karten, Themen, Rollen und Länder mit Farbfilter", () => {
    const specs = buildListSpecs(["B", "G"], [{ name: "Aristokraten", description: "", query: "otag:sacrifice-outlet" }], new Date("2026-10-10"));
    expect(specs.map((s) => s.key)).toEqual(["new", "theme-0", "top", "ramp", "draw", "removal", "wipe", "lands"]);
    expect(specs[0].query).toContain("date>=2026-06-12");
    expect(specs[0].query).toContain("not:reprint");
    expect(specs[1].query).toBe("(otag:sacrifice-outlet) id<=bg legal:commander");
    expect(specs.every((s) => s.query.includes("id<=bg"))).toBe(true);
  });
});

describe("cleanList", () => {
  it("entfernt den Commander und Dubletten", () => {
    const out = cleanList([compact("Meren"), compact("Sol Ring"), compact("Sol Ring")], ["Meren"]);
    expect(out.map((c) => c.name)).toEqual(["Sol Ring"]);
  });
});

describe("filterCards", () => {
  const cards = [
    listCard("Billig"),
    listCard("Teuer", { eur: 50 }),
    listCard("Teuer, aber besessen", { eur: 50, owned: 1 }),
    listCard("Game Changer", { gameChanger: true, owned: 1 }),
  ];

  it("Budget gilt nur für fehlende Karten", () => {
    const out = filterCards(cards, { maxPrice: 5, noGameChangers: false, ownership: "all" });
    expect(out.map((c) => c.name)).toEqual(["Billig", "Teuer, aber besessen", "Game Changer"]);
  });

  it("filtert Game Changer und Besitz", () => {
    expect(filterCards(cards, { maxPrice: null, noGameChangers: true, ownership: "owned" }).map((c) => c.name)).toEqual([
      "Teuer, aber besessen",
    ]);
    expect(filterCards(cards, { maxPrice: null, noGameChangers: false, ownership: "missing" })).toHaveLength(2);
  });
});
