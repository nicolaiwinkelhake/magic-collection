import { describe, expect, it } from "vitest";
import { ALL, UNSORTED, attachFolders, collectionMeasure, folderStats, inFolder, wishlistMeasure, withFolder } from "@/lib/folders";

const c = (id: string, folder_ids: string[], quantity: number, price: number) => ({
  id,
  folder_ids,
  quantity,
  foil: false,
  price_eur: price,
  price_eur_foil: null,
  condition: "NM",
});

describe("folders (Mehrfach-Zuordnung)", () => {
  const cards = [c("a", [], 2, 1), c("b", ["f1"], 3, 2), c("c", ["f1", "f2"], 1, 10), c("d", ["f2"], 1, 0.5)];

  it("zählt eine Karte in jedem ihrer Ordner, gesamt nur einmal", () => {
    const s = folderStats(cards, collectionMeasure);
    expect(s.get(ALL)).toEqual({ cards: 7, entries: 4, value: 18.5 });
    expect(s.get(UNSORTED)).toEqual({ cards: 2, entries: 1, value: 2 });
    expect(s.get("f1")).toEqual({ cards: 4, entries: 2, value: 16 });
    expect(s.get("f2")).toEqual({ cards: 2, entries: 2, value: 10.5 });
  });

  it("Wunschliste: je Karte ein Exemplar zum Preis", () => {
    const s = folderStats([{ folder_ids: ["f1"], price_eur: 3 }, { folder_ids: [], price_eur: null }], wishlistMeasure);
    expect(s.get(ALL)).toEqual({ cards: 2, entries: 2, value: 3 });
    expect(s.get("f1")).toEqual({ cards: 1, entries: 1, value: 3 });
    expect(s.get(UNSORTED)).toEqual({ cards: 1, entries: 1, value: 0 });
  });

  it("filtert nach Ordner", () => {
    expect(inFolder(cards, ALL)).toHaveLength(4);
    expect(inFolder(cards, UNSORTED).map((x) => x.id)).toEqual(["a"]);
    expect(inFolder(cards, "f2").map((x) => x.id)).toEqual(["c", "d"]);
    expect(inFolder(cards, "unbekannt")).toHaveLength(0);
  });

  it("hängt Zuordnungen an und ändert sie lokal", () => {
    const items = attachFolders([{ id: "a" }, { id: "b" }], [
      { folder_id: "f1", target: "a" },
      { folder_id: "f2", target: "a" },
      { folder_id: "f1", target: "a" },
      { folder_id: "f1", target: null },
    ]);
    expect(items).toEqual([{ id: "a", folder_ids: ["f1", "f2"] }, { id: "b", folder_ids: [] }]);
    const added = withFolder(items, new Set(["a", "b"]), "f3", true);
    expect(added.map((x) => x.folder_ids)).toEqual([["f1", "f2", "f3"], ["f3"]]);
    const removed = withFolder(added, new Set(["a"]), "f1", false);
    expect(removed[0].folder_ids).toEqual(["f2", "f3"]);
    expect(removed[1]).toBe(added[1]);
  });
});
