import { describe, expect, it } from "vitest";
import { addPending, addScan, failPending, resolvePending, setQuantity, stackTotals, undoLast, unresolved, updateItem, type ScanMatch } from "@/lib/scanStack";

const m = (id: string, eur = 1, eurFoil: number | null = 3): ScanMatch => ({ id, name: `Card ${id}`, imageUrl: null, eur, eurFoil });

describe("scanStack", () => {
  it("zählt gleichen Druck + Foil zusammen und holt ihn nach oben", () => {
    let s = addScan([], m("a"), false, 1);
    s = addScan(s, m("b"), false, 2);
    s = addScan(s, m("a"), false, 3);
    expect(s.map((x) => [x.id, x.quantity])).toEqual([["a", 2], ["b", 1]]);
    s = addScan(s, m("a"), true, 4);
    expect(s).toHaveLength(3);
  });

  it("merkt den Fingerabdruck des Kamerabilds", () => {
    const s = addScan([], m("a"), false, 1, [1, 0, 1]);
    expect(s[0].camHash).toEqual([1, 0, 1]);
  });

  it("rückgängig nimmt eine Kopie bzw. den Eintrag weg", () => {
    let s = addScan(addScan([], m("a"), false), m("a"), false);
    s = undoLast(s);
    expect(s[0].quantity).toBe(1);
    expect(undoLast(s)).toEqual([]);
    expect(undoLast([])).toEqual([]);
  });

  it("Menge 0 entfernt", () => {
    const s = addScan([], m("a"), false);
    expect(setQuantity(s, s[0].key, 0)).toEqual([]);
    expect(setQuantity(s, s[0].key, 4)[0].quantity).toBe(4);
  });

  it("Foil/Druck ändern legt mit vorhandenem Eintrag zusammen", () => {
    let s = addScan([], m("a"), true);
    s = addScan(s, m("a"), false);
    const nonFoil = s.find((x) => !x.foil)!;
    s = updateItem(s, nonFoil.key, { foil: true });
    expect(s).toHaveLength(1);
    expect(s[0].quantity).toBe(2);
    s = updateItem(s, s[0].key, { print: m("z", 5, 9) });
    expect(s[0].id).toBe("z");
    expect(s[0].foil).toBe(true);
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
    expect(done).toEqual([{ ...bolt, key: "b1|0", foil: false, quantity: 1, scannedAt: 5, camHash: [1, 0] }]);
    expect(unresolved(done)).toEqual({ pending: 0, failed: 0 });
  });

  it("legt mit vorhandenem gleichen Druck zusammen", () => {
    const first = resolvePending(addPending([], "Lightning Bolt", false, 1).stack, addPending([], "x", false).key, bolt);
    let { stack, key } = addPending([{ ...bolt, key: "b1|0", foil: false, quantity: 2, scannedAt: 0 }], "Lightning Bolt", false, 9);
    stack = resolvePending(stack, key, bolt);
    expect(stack).toHaveLength(1);
    expect(stack[0].quantity).toBe(3);
    expect(first).toHaveLength(1); // unbekannter Schlüssel ändert nichts
  });

  it("markiert Fehlschläge und ignoriert zurückgenommene Einträge", () => {
    const { stack, key } = addPending([], "Unbekannt", true);
    const failed = failPending(stack, key);
    expect(failed[0]).toMatchObject({ failed: true, pending: false, foil: true });
    expect(unresolved(failed)).toEqual({ pending: 0, failed: 1 });
    expect(resolvePending([], key, bolt)).toEqual([]);
  });
});
