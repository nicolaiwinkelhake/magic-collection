import { describe, expect, it } from "vitest";
import { addPending, addScan, failPending, resolvePending, setQuantity, stackTotals, undoLast, unresolved, updateItem, type ScanMatch } from "@/lib/scanStack";

const m = (id: string, eur = 1, eurFoil: number | null = 3): ScanMatch => ({ id, name: `Card ${id}`, imageUrl: null, eur, eurFoil });

describe("scanStack", () => {
  it("jeder Scan ist ein eigener Eintrag, neuester oben – auch bei gleichem Druck", () => {
    let s = addScan([], m("a"), false, 1);
    s = addScan(s, m("b"), false, 2);
    s = addScan(s, m("a"), false, 3);
    expect(s.map((x) => [x.id, x.quantity, x.scannedAt])).toEqual([["a", 1, 3], ["b", 1, 2], ["a", 1, 1]]);
    expect(new Set(s.map((x) => x.key)).size).toBe(3);
  });

  it("merkt den Fingerabdruck des Kamerabilds", () => {
    const s = addScan([], m("a"), false, 1, [1, 0, 1]);
    expect(s[0].camHash).toEqual([1, 0, 1]);
  });

  it("rückgängig nimmt den letzten Scan weg", () => {
    let s = addScan(addScan([], m("a"), false, 1), m("a"), false, 2);
    s = undoLast(s);
    expect(s).toHaveLength(1);
    expect(s[0].scannedAt).toBe(1);
    s = setQuantity(s, s[0].key, 2);
    expect(undoLast(s)[0].quantity).toBe(1);
    expect(undoLast([])).toEqual([]);
  });

  it("Menge 0 entfernt", () => {
    const s = addScan([], m("a"), false);
    expect(setQuantity(s, s[0].key, 0)).toEqual([]);
    expect(setQuantity(s, s[0].key, 4)[0].quantity).toBe(4);
  });

  it("Foil/Druck ändern betrifft nur diesen Eintrag, Reihenfolge bleibt", () => {
    let s = addScan([], m("a"), true, 1);
    s = addScan(s, m("a"), false, 2);
    const nonFoil = s.find((x) => !x.foil)!;
    s = updateItem(s, nonFoil.key, { foil: true });
    expect(s).toHaveLength(2);
    expect(s.map((x) => x.scannedAt)).toEqual([2, 1]);
    s = updateItem(s, s[0].key, { print: m("z", 5, 9) });
    expect(s[0]).toMatchObject({ id: "z", foil: true, key: nonFoil.key });
    expect(s[1].id).toBe("a");
  });

  it("summiert Karten und Wert (Foil-Preis, sonst Normalpreis)", () => {
    let s = addScan([], m("a", 2, 5), true);
    s = addScan(s, m("b", 1.5, null), true);
    s = setQuantity(s, s[1].key, 2);
    // a: Foil 5 € × 2, b: kein Foilpreis → 1,50 €
    expect(stackTotals(s)).toEqual({ cards: 3, value: 11.5 });
  });
});


describe("sofort bestätigen (vorläufige Einträge)", () => {
  const bolt = { id: "b1", name: "Lightning Bolt", imageUrl: null, eur: 1, eurFoil: 3 };

  it("ersetzt den vorläufigen Eintrag durch den Druck", () => {
    const { stack, key } = addPending([], "Lightning Bolt", false, 5);
    expect(stack[0]).toMatchObject({ name: "Lightning Bolt", pending: true, quantity: 1 });
    expect(unresolved(stack)).toEqual({ pending: 1, failed: 0 });
    const done = resolvePending(stack, key, bolt, [1, 0]);
    expect(done).toEqual([{ ...bolt, key, foil: false, quantity: 1, scannedAt: 5, camHash: [1, 0] }]);
    expect(unresolved(done)).toEqual({ pending: 0, failed: 0 });
  });

  it("legt nicht zusammen, wenn der Druck schon im Stapel liegt", () => {
    const first = resolvePending(addPending([], "Lightning Bolt", false, 1).stack, addPending([], "x", false).key, bolt);
    let { stack, key } = addPending([{ ...bolt, key: "old", foil: false, quantity: 2, scannedAt: 0 }], "Lightning Bolt", false, 9);
    stack = resolvePending(stack, key, bolt);
    expect(stack).toHaveLength(2);
    expect(stack.map((x) => [x.key, x.quantity])).toEqual([[key, 1], ["old", 2]]);
    expect(first).toHaveLength(1); // unbekannter Schlüssel ändert nichts
  });

  it("zuletzt gescannte Karte bleibt oben, auch wenn der Druck schon weiter unten liegt", () => {
    const sol = { id: "s1", name: "Sol Ring", imageUrl: null, eur: 1, eurFoil: null };
    const base = [
      { ...sol, key: "s1|0", foil: false, quantity: 1, scannedAt: 3 },
      { ...bolt, key: "b1|0", foil: false, quantity: 2, scannedAt: 1 },
    ];
    let { stack, key } = addPending(base, "Lightning Bolt", false, 9);
    stack = resolvePending(stack, key, bolt);
    expect(stack.map((s) => s.key)).toEqual([key, "s1|0", "b1|0"]);
    expect(stack[0]).toMatchObject({ id: "b1", quantity: 1, scannedAt: 9 });
  });

  it("markiert Fehlschläge und ignoriert zurückgenommene Einträge", () => {
    const { stack, key } = addPending([], "Unbekannt", true);
    const failed = failPending(stack, key);
    expect(failed[0]).toMatchObject({ failed: true, pending: false, foil: true });
    expect(unresolved(failed)).toEqual({ pending: 0, failed: 1 });
    expect(resolvePending([], key, bolt)).toEqual([]);
  });
});
