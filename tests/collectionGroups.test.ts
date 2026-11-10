import { describe, expect, it } from "vitest";
import { groupCards } from "@/lib/collectionGroups";

const card = (o: Partial<Parameters<typeof groupCards>[0][number]> = {}) => ({
  quantity: 1,
  foil: false,
  price_eur: 1,
  price_eur_foil: null,
  condition: "NM",
  set_code: "mh3",
  colors: ["G"],
  rarity: "common",
  type_line: "Creature — Elf",
  ...o,
});

describe("groupCards", () => {
  it("ohne Gruppierung eine Gruppe", () => {
    const g = groupCards([card(), card()], "none");
    expect(g).toHaveLength(1);
    expect(g[0].count).toBe(2);
  });

  it("zählt Mengen und Wert je Gruppe", () => {
    const g = groupCards([card({ quantity: 3, price_eur: 2 }), card({ set_code: "woe" })], "set");
    expect(g.map((x) => x.label)).toEqual(["MH3", "WOE"]);
    expect(g[0].count).toBe(3);
    expect(g[0].value).toBe(6);
  });

  it("Farben in WUBRG-Reihenfolge, Mehrfarbig und Farblos am Ende", () => {
    const g = groupCards(
      [card({ colors: [] }), card({ colors: ["G", "U"] }), card({ colors: ["G"] }), card({ colors: ["W"] })],
      "color",
    );
    expect(g.map((x) => x.label)).toEqual(["Weiß", "Grün", "Mehrfarbig", "Farblos"]);
  });

  it("Seltenheit von Mythic abwärts", () => {
    const g = groupCards([card({ rarity: "common" }), card({ rarity: "mythic" }), card({ rarity: "rare" })], "rarity");
    expect(g.map((x) => x.key)).toEqual(["mythic", "rare", "common"]);
  });

  it("Typ nach Vorderseite, Kreatur vor Land", () => {
    const g = groupCards(
      [card({ type_line: "Basic Land — Forest" }), card({ type_line: "Land Creature — Forest Dryad" }), card({ type_line: "Instant" })],
      "type",
    );
    expect(g.map((x) => x.label)).toEqual(["Kreaturen", "Spontanzauber", "Länder"]);
  });
});
