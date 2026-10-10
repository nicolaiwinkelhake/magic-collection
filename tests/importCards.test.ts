import { describe, it, expect } from "vitest";
import { aggregateEntries, planImport, type ResolvedEntry } from "@/lib/importCards";

const card = (id: string, name = `Card ${id}`) => ({ id, name });
const entry = (id: string, quantity = 1, foil = false): ResolvedEntry => ({ card: card(id), quantity, foil });

describe("aggregateEntries", () => {
  it("fasst gleiche Karte + Foil zusammen", () => {
    const out = aggregateEntries([entry("a", 2), entry("a", 3), entry("b")]);
    expect(out).toHaveLength(2);
    expect(out.find((e) => e.card.id === "a")?.quantity).toBe(5);
  });

  it("trennt Foil und Nicht-Foil", () => {
    expect(aggregateEntries([entry("a", 1, false), entry("a", 1, true)])).toHaveLength(2);
  });

  it("verändert die Eingabe nicht", () => {
    const input = [entry("a", 2), entry("a", 3)];
    aggregateEntries(input);
    expect(input[0].quantity).toBe(2);
  });
});

describe("planImport", () => {
  it("fügt neue Karten ein", () => {
    const plan = planImport([entry("a"), entry("b")], [], false);
    expect(plan.inserts).toHaveLength(2);
    expect(plan.updates).toHaveLength(0);
  });

  it("überspringt vorhandene Karten ohne Duplikate", () => {
    const plan = planImport([entry("a")], [{ id: "row1", scryfall_id: "a", foil: false, quantity: 2 }], false);
    expect(plan.inserts).toHaveLength(0);
    expect(plan.skipped).toEqual(["Card a"]);
  });

  it("erhöht Menge vorhandener Karten mit Duplikaten", () => {
    const plan = planImport(
      [entry("a", 2), entry("a", 1)],
      [{ id: "row1", scryfall_id: "a", foil: false, quantity: 4 }],
      true
    );
    expect(plan.updates).toEqual([expect.objectContaining({ id: "row1", newQuantity: 7 })]);
  });

  it("vorhandene Nicht-Foil-Karte blockiert keine Foil-Version", () => {
    const plan = planImport([entry("a", 1, true)], [{ id: "row1", scryfall_id: "a", foil: false, quantity: 1 }], false);
    expect(plan.inserts).toHaveLength(1);
    expect(plan.skipped).toHaveLength(0);
  });
});
