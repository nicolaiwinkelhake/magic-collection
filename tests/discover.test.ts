import { describe, it, expect } from "vitest";
import { buildablePoolSpecs, fitsIdentity, identityKey, sanitizeType, scorePool } from "@/lib/discover";

describe("discover", () => {
  it("identityKey sortiert WUBRG, farblos = C", () => {
    expect(identityKey(["G", "B"])).toBe("BG");
    expect(identityKey([])).toBe("C");
  });

  it("Pool ohne Themen und ohne neue Karten", () => {
    expect(buildablePoolSpecs(["B"]).map((s) => s.key)).toEqual(["top", "ramp", "draw", "removal", "wipe", "lands"]);
  });

  it("scorePool zählt Dubletten einmal und summiert fehlende Preise", () => {
    const s = scorePool(
      [
        { name: "Sol Ring", eur: 1 },
        { name: "Sol Ring", eur: 1 },
        { name: "Rhystic Study", eur: 30 },
        { name: "Cultivate", eur: null },
      ],
      new Set(["Sol Ring"])
    );
    expect(s).toEqual({ owned: 1, total: 3, share: 1 / 3, missingValue: 30 });
  });

  it("sanitizeType lässt nur Typnamen zu", () => {
    expect(sanitizeType(" Elf ")).toBe("Elf");
    expect(sanitizeType("Time Lord")).toBe("Time Lord");
    expect(sanitizeType("elf) or (t:dragon")).toBeNull();
  });

  it("fitsIdentity prüft Teilmenge", () => {
    expect(fitsIdentity(["B"], ["B", "G"])).toBe(true);
    expect(fitsIdentity([], ["B"])).toBe(true);
    expect(fitsIdentity(["R"], ["B", "G"])).toBe(false);
  });
});
