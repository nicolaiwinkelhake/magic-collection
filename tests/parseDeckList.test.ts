import { describe, it, expect } from "vitest";
import { parseDeckList } from "@/lib/parseDeckList";

describe("parseDeckList", () => {
  it("liest einen einfachen Namen", () => {
    expect(parseDeckList("Sol Ring")).toEqual([
      { name: "Sol Ring", quantity: 1, foil: false },
    ]);
  });

  it("erkennt Mengen mit und ohne x", () => {
    expect(parseDeckList("2x Lightning Bolt")[0]).toEqual({
      name: "Lightning Bolt",
      quantity: 2,
      foil: false,
    });
    expect(parseDeckList("3 Island")[0]).toEqual({
      name: "Island",
      quantity: 3,
      foil: false,
    });
  });

  it("erkennt Foil-Marker *F* und (foil)", () => {
    expect(parseDeckList("Brainstorm *F*")[0].foil).toBe(true);
    expect(parseDeckList("1 Ponder (foil)")[0]).toEqual({
      name: "Ponder",
      quantity: 1,
      foil: true,
    });
  });

  it("ignoriert leere Zeilen und trimmt", () => {
    const res = parseDeckList("\n  Sol Ring  \n\n2x Brainstorm\n");
    expect(res).toHaveLength(2);
    expect(res[0].name).toBe("Sol Ring");
  });

  it("behandelt Namen mit Zahlen korrekt (keine falsche Mengenerkennung)", () => {
    // "Borrowing 100,000 Arrows" hat keine führende Menge
    const res = parseDeckList("Borrowing 100,000 Arrows");
    expect(res[0].name).toBe("Borrowing 100,000 Arrows");
    expect(res[0].quantity).toBe(1);
  });
});

describe("parseDeckList – Druck (Set + Nummer)", () => {
  it("übernimmt Set und Sammlernummer aus Moxfield/Archidekt/Arena-Zeilen", () => {
    expect(parseDeckList("1 Sol Ring (C21) 263")[0]).toEqual({ name: "Sol Ring", quantity: 1, foil: false, set: "c21", collectorNumber: "263" });
    expect(parseDeckList("1x Arcane Signet (cmr) 297 [Ramp] *F*")[0]).toEqual({
      name: "Arcane Signet",
      quantity: 1,
      foil: true,
      set: "cmr",
      collectorNumber: "297",
    });
    expect(parseDeckList("1 Opt (PLST) XLN-65")[0]).toMatchObject({ name: "Opt", set: "plst", collectorNumber: "XLN-65" });
    expect(parseDeckList("1 Forest (UNF) 239★")[0]).toMatchObject({ name: "Forest", set: "unf", collectorNumber: "239★" });
    expect(parseDeckList("2 Island (LTR)")[0]).toEqual({ name: "Island", quantity: 2, foil: false, set: "ltr" });
    expect(parseDeckList("1 Delver of Secrets // Insectile Aberration (ISD) 51")[0]).toMatchObject({
      name: "Delver of Secrets // Insectile Aberration",
      set: "isd",
      collectorNumber: "51",
    });
  });

  it("verwechselt Foil-Marker nicht mit einem Set", () => {
    expect(parseDeckList("3 Island (foil)")[0]).toEqual({ name: "Island", quantity: 3, foil: true });
  });
});
