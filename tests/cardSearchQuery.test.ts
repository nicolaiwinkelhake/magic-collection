import { describe, expect, it } from "vitest";
import { parseSearchQuery } from "@/lib/cardSearchQuery";

const prints = (q: string) => parseSearchQuery(q).prints;

describe("Handeingabe: Set + Nummer oder Name", () => {
  it("Set + Nummer in verschiedenen Schreibweisen", () => {
    expect(prints("mkm 94")).toEqual([{ set: "mkm", number: "94" }]);
    expect(prints("MKM #94")).toEqual([{ set: "mkm", number: "94" }]);
    expect(prints("mkm 0094")).toEqual([{ set: "mkm", number: "94" }]);
    expect(prints("94 mkm")).toEqual([{ set: "mkm", number: "94" }]);
    expect(prints("#94 mkm")).toEqual([{ set: "mkm", number: "94" }]);
    expect(prints("m15 138")).toEqual([{ set: "m15", number: "138" }]);
    expect(prints("10e 182")).toEqual([{ set: "10e", number: "182" }]);
    expect(prints("mh2 34a")).toEqual([{ set: "mh2", number: "34a" }]);
  });
  it("mit Bindestrich auch der Druck aus The List", () => {
    expect(prints("MKM-94")).toEqual([{ set: "mkm", number: "94" }, { set: "plst", number: "MKM-94" }]);
    expect(prints("plst mkm-94")).toEqual([{ set: "plst", number: "MKM-94" }]);
    expect(prints("plst m15 138")).toEqual([{ set: "plst", number: "M15-138" }]);
  });
  it("Namen bleiben Namen", () => {
    expect(prints("sol r")).toEqual([]);
    expect(prints("Lightning Bolt")).toEqual([]);
    expect(prints("blitzschlag")).toEqual([]);
    expect(prints("2 15")).toEqual([]); // Set braucht einen Buchstaben
    expect(parseSearchQuery("  Sol   Ring ").name).toBe("sol ring");
  });
});
