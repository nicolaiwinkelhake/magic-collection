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
