import { describe, expect, it } from "vitest";
import { planMove, samePrintFamily } from "@/lib/cardMove";

const row = { id: "r1", scryfall_id: "a", foil: false, quantity: 2 };

describe("planMove", () => {
  it("nichts zu tun", () => {
    expect(planMove(row, { scryfall_id: "a", foil: false }, null)).toEqual({ kind: "noop" });
  });
  it("umschreiben, wenn Ziel noch nicht existiert", () => {
    expect(planMove(row, { scryfall_id: "b", foil: false }, null)).toEqual({ kind: "update" });
    expect(planMove(row, { scryfall_id: "a", foil: true }, null)).toEqual({ kind: "update" });
  });
  it("zusammenlegen, wenn Ziel existiert", () => {
    expect(planMove(row, { scryfall_id: "b", foil: false }, { id: "r2", quantity: 3 })).toEqual({
      kind: "merge",
      targetId: "r2",
      quantity: 5,
    });
  });
  it("eigene Zeile zählt nicht als Ziel", () => {
    expect(planMove(row, { scryfall_id: "b", foil: false }, { id: "r1", quantity: 2 })).toEqual({ kind: "update" });
  });
});

describe("samePrintFamily", () => {
  it("vergleicht oracle_id, auch auf Kartenseiten", () => {
    expect(samePrintFamily({ oracle_id: "o", name: "X" }, { oracle_id: "o", name: "Y" })).toBe(true);
    expect(samePrintFamily({ oracle_id: "o", name: "X" }, { oracle_id: "p", name: "X" })).toBe(false);
    expect(samePrintFamily({ name: "A // B", card_faces: [{ oracle_id: "q" }] }, { oracle_id: "q", name: "A // B" })).toBe(true);
  });
  it("fällt auf den Namen zurück", () => {
    expect(samePrintFamily({ name: "Sol Ring" }, { name: "sol ring" })).toBe(true);
  });
});
