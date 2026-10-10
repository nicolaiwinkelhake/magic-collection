import { describe, it, expect } from "vitest";
import { cleanOcrLine, nameCandidates, preprocessPixels, resolveVariants } from "@/lib/ocr";

describe("cleanOcrLine", () => {
  it("behält Kommas und Apostrophe, entfernt Störzeichen", () => {
    expect(cleanOcrLine("Atraxa, Praetors' Voice {2}{G}")).toBe("Atraxa, Praetors' Voice");
    expect(cleanOcrLine("  ~Meren of Clan Nel Toth 3 ")).toBe("Meren of Clan Nel Toth");
    expect(cleanOcrLine("Gedankenwirbel")).toBe("Gedankenwirbel");
    expect(cleanOcrLine("Ll|anowar Elves")).toBe("Lllanowar Elves");
  });
});

describe("nameCandidates", () => {
  it("sortiert nach Konfidenz, filtert Kurzes/Langes und Dubletten", () => {
    const out = nameCandidates([
      { text: "xy", confidence: 99 },
      { text: "Sol Ring", confidence: 70 },
      { text: "Artifact", confidence: 80 },
      { text: "sol ring", confidence: 60 },
      { text: "a".repeat(60), confidence: 95 },
    ]);
    expect(out).toEqual(["Artifact", "Sol Ring"]);
  });
});

describe("resolveVariants", () => {
  it("kürzt am Ende um bis zu zwei Wörter", () => {
    expect(resolveVariants("Meren of Clan Nel Toth W ii")).toEqual([
      "Meren of Clan Nel Toth W ii",
      "Meren of Clan Nel Toth W",
      "Meren of Clan Nel Toth",
    ]);
    expect(resolveVariants("Opt")).toEqual(["Opt"]);
  });
});

describe("preprocessPixels", () => {
  it("streckt den Kontrast auf 0–255", () => {
    const px = new Uint8ClampedArray([100, 100, 100, 255, 200, 200, 200, 255]);
    preprocessPixels(px);
    expect([px[0], px[4]]).toEqual([0, 255]);
  });

  it("invertiert dunkle Bilder (helle Schrift auf dunklem Grund)", () => {
    const px = new Uint8ClampedArray([10, 10, 10, 255, 10, 10, 10, 255, 200, 200, 200, 255]);
    preprocessPixels(px);
    expect(px[0]).toBe(255); // dunkler Hintergrund wird hell
    expect(px[8]).toBe(0); // helle Schrift wird dunkel
  });
});

import { parseCardInfo } from "@/lib/ocr";

describe("parseCardInfo", () => {
  it("liest Set, Nummer und Sprache aus der Infozeile", () => {
    expect(parseCardInfo("u 0001\nMKM «EN %> PETER PoLAcH")).toEqual({ set: "mkm", number: "1", lang: "EN" });
    expect(parseCardInfo("M 0100 Story Spotlight hb\nBLB + EN %>ALESSANDRA Pisano")).toEqual({
      set: "blb",
      number: "100",
      lang: "EN",
    });
    expect(parseCardInfo("C 0050\nWOE +EN %> LEANNA CROSSAN")).toEqual({ set: "woe", number: "50", lang: "EN" });
    expect(parseCardInfo("123/280 R\nDMU • DE")).toEqual({ set: "dmu", number: "123", lang: "DE" });
  });

  it("liefert null, wenn nichts erkennbar ist (ältere Karten)", () => {
    expect(parseCardInfo("Illus. Christopher Rush")).toEqual({ set: null, number: null, lang: null });
  });
});
