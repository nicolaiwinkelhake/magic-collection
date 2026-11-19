import { describe, expect, it } from "vitest";
import { choosePrint, narrowPrints, normNumber } from "@/lib/printChoice";

const bits = (fill: number, flip = 0) => {
  const a = new Uint8Array(192).fill(fill);
  for (let i = 0; i < flip; i++) a[i] = 1 - fill;
  return a;
};
const prints = [
  { id: "a", set: "c21", collectorNumber: "263", hash: bits(0, 30) },
  { id: "b", set: "c20", collectorNumber: "252", hash: bits(0, 40) },
  { id: "c", set: "c19", collectorNumber: "221", hash: bits(1) },
  { id: "d", set: "cmr", collectorNumber: "472", hash: bits(0, 90) },
];

describe("Druck bestimmen", () => {
  it("Nummer allein grenzt auf einen Druck ein", () => {
    expect(choosePrint(prints, null, { number: "0252" })).toEqual({ best: prints[1], by: "nummer" });
  });
  it("Set allein grenzt ein", () => {
    expect(choosePrint(prints, null, { set: "C19" })?.best.id).toBe("c");
  });
  it("Nummer und Set zusammen", () => {
    expect(choosePrint(prints, null, { set: "c21", number: "263" })?.by).toBe("nummer+set");
  });
  it("nicht passende Angaben werden ignoriert, dann entscheidet das Bild", () => {
    const cam = bits(0, 28);
    expect(choosePrint(prints, cam, { number: "999" })).toEqual({ best: prints[0], by: "bild" });
  });
  it("Bild nur, wenn eindeutig", () => {
    expect(choosePrint(prints, bits(0, 35), null)).toBeNull(); // a (5) und b (5) gleich nah
  });
  it("Hilfsfunktionen", () => {
    expect(normNumber("007a")).toBe("7");
    expect(narrowPrints(prints, { set: "xxx" }).list).toHaveLength(4);
  });
});
