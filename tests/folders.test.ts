import { describe, expect, it } from "vitest";
import { ALL, UNSORTED, folderStats, inFolder } from "@/lib/folders";

const c = (folder_id: string | null, quantity: number, price: number) => ({ folder_id, quantity, foil: false, price_eur: price, price_eur_foil: null, condition: "NM" });

describe("folders", () => {
  const cards = [c(null, 2, 1), c("f1", 3, 2), c("f1", 1, 10), c("f2", 1, 0.5)];

  it("zählt Karten, Einträge und Wert je Ordner", () => {
    const s = folderStats(cards);
    expect(s.get(ALL)).toEqual({ cards: 7, entries: 4, value: 18.5 });
    expect(s.get(UNSORTED)).toEqual({ cards: 2, entries: 1, value: 2 });
    expect(s.get("f1")).toEqual({ cards: 4, entries: 2, value: 16 });
    expect(s.get("f2")).toEqual({ cards: 1, entries: 1, value: 0.5 });
  });

  it("filtert nach Ordner", () => {
    expect(inFolder(cards, ALL)).toHaveLength(4);
    expect(inFolder(cards, UNSORTED)).toHaveLength(1);
    expect(inFolder(cards, "f1")).toHaveLength(2);
    expect(inFolder(cards, "unbekannt")).toHaveLength(0);
  });
});
