import { describe, expect, it } from "vitest";
import { sortByPercent, upcomingSets } from "@/lib/setsView";
import type { ScryfallSet } from "@/lib/scryfall";

const set = (o: Partial<ScryfallSet>): ScryfallSet => ({
  code: "x", name: "X", card_count: 10, released_at: "2027-01-01", set_type: "expansion", icon_svg_uri: null, scryfall_uri: null, parent_set_code: null, ...o,
});

describe("sortByPercent", () => {
  it("höchster Prozentwert oben, unbekannte Größe am Ende", () => {
    const rows = [
      { code: "a", owned: 5, total: 100, released: "2020" },
      { code: "b", owned: 50, total: 100, released: "2019" },
      { code: "c", owned: 3, total: 0, released: "2026" },
      { code: "d", owned: 10, total: 20, released: "2018" },
      { code: "e", owned: 100, total: 200, released: "2021" },
    ];
    expect(sortByPercent(rows).map((r) => r.code)).toEqual(["e", "b", "d", "a", "c"]);
  });
});

describe("upcomingSets", () => {
  it("nur künftige Sammler-Sets, Commander beim Hauptset, nach Datum", () => {
    const all = [
      set({ code: "old", released_at: "2026-01-01" }),
      set({ code: "nau", name: "Nauctis", released_at: "2027-02-05" }),
      set({ code: "nac", name: "Nauctis Commander", released_at: "2027-02-05", set_type: "commander", parent_set_code: "nau" }),
      set({ code: "tnau", released_at: "2027-02-05", set_type: "token", parent_set_code: "nau" }),
      set({ code: "pw27", released_at: "2027-01-01", set_type: "promo" }),
      set({ code: "mdd", name: "Darkhold", released_at: "2027-04-09" }),
    ];
    const up = upcomingSets(all, "2026-11-18");
    expect(up.map((u) => u.code)).toEqual(["nau", "mdd"]);
    expect(up[0].related).toEqual([{ code: "nac", name: "Nauctis Commander", type: "Commander" }]);
    expect(up[0].daysLeft).toBe(79);
  });
});

import { setValueMoves } from "@/lib/setsView";

describe("Wertzuwachs/-verlust je Set (7 Tage)", () => {
  const c = (set_code: string, scryfall_id: string, price_eur: number, quantity = 1, foil = false, price_eur_foil: number | null = null) => ({ set_code, scryfall_id, price_eur, price_eur_foil, quantity, foil });
  it("rechnet je Set mit Menge und Foil, findet größten Zuwachs und Verlust", () => {
    const { bySet, up, down } = setValueMoves(
      [c("mbc", "a", 24.31), c("mbc", "b", 6.83, 2), c("tdm", "f", 1.5, 3), c("frf", "t", 3.87), c("mom", "x", 0, 1, true, 7.35), c("neu", "n", 5)],
      { a: [21.32, null], b: [5.38, null], f: [1, null], t: [4.24, null], x: [1, 7.84] },
    );
    expect(bySet.get("mbc")!.delta).toBeCloseTo(2.99 + 2 * 1.45);
    expect(up!.code).toBe("mbc");
    expect(down!.code).toBe("mom");
    expect(down!.delta).toBeCloseTo(-0.49);
    expect(bySet.has("neu")).toBe(false);
  });
  it("ohne Bewegung kein Abzeichen", () => {
    const r = setValueMoves([c("a", "1", 2)], { "1": [2, null] });
    expect(r.up).toBeNull();
    expect(r.down).toBeNull();
  });
});
