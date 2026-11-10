import { describe, expect, it } from "vitest";
import { fileToEntries, looksLikeCsv, textToEntries } from "@/lib/importSource";

describe("textToEntries", () => {
  it("liest Mengen und Foil aus Textzeilen", () => {
    const r = textToEntries("2x Lightning Bolt\nBrainstorm *F*");
    expect(r.mode).toBe("text");
    expect(r.entries).toEqual([
      expect.objectContaining({ name: "Lightning Bolt", quantity: 2, foil: false, line: 1 }),
      expect.objectContaining({ name: "Brainstorm", foil: true, line: 2 }),
    ]);
  });

  it("meldet leere Eingabe", () => {
    expect(textToEntries("   \n").problem).toBeTruthy();
  });

  it("erkennt eingefügte CSV", () => {
    const r = textToEntries("Name,Quantity\nSol Ring,3\n");
    expect(r.entries[0]).toEqual(expect.objectContaining({ name: "Sol Ring", quantity: 3 }));
  });
});

describe("fileToEntries", () => {
  it("nutzt Scryfall-IDs aus ManaBox/Moxfield-CSV", () => {
    const csv =
      "Name,Set code,Collector number,Foil,Quantity,Scryfall ID\n" +
      "Sol Ring,cmm,410,normal,2,11111111-2222-3333-4444-555555555555\n";
    const r = fileToEntries(csv);
    expect(r.mode).toBe("csv");
    expect(r.entries[0]).toEqual(
      expect.objectContaining({ name: "Sol Ring", scryfallId: "11111111-2222-3333-4444-555555555555" }),
    );
  });

  it("fällt auf Namen zurück und entfernt BOM", () => {
    const r = fileToEntries("﻿Card Name,Count\nCounterspell,4\n");
    expect(r.mode).toBe("text");
    expect(r.entries[0]).toEqual(expect.objectContaining({ name: "Counterspell", quantity: 4 }));
  });
});

describe("looksLikeCsv", () => {
  it("unterscheidet Kopfzeile und Kartenname mit Komma", () => {
    expect(looksLikeCsv("Name,Quantity\nX,1")).toBe(true);
    expect(looksLikeCsv("Sheoldred, the Apocalypse\nSol Ring")).toBe(false);
  });
});
