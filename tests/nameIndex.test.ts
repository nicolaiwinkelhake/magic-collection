import { describe, expect, it } from "vitest";
import { buildNameIndex, matchName, partialDistance, readScore } from "@/lib/nameIndex";

const NAMES = [
  "Lightning Bolt",
  "Lightning Helix",
  "Chain Lightning",
  "Llanowar Elves",
  "Elvish Mystic",
  "Atraxa, Praetors' Voice",
  "Delver of Secrets // Insectile Aberration",
  "Sol Ring",
  "Solemn Simulacrum",
  "Counterspell",
];

describe("nameIndex", () => {
  const index = buildNameIndex(NAMES);

  it("korrigiert typische Lesefehler sofort", () => {
    expect(matchName(index, "Lightning Bolt")).toEqual({ name: "Lightning Bolt", score: 1, confident: true });
    expect(matchName(index, "htning Bolt")).toMatchObject({ name: "Lightning Bolt", confident: true });
    expect(matchName(index, "Lightnmg Bo1t")).toMatchObject({ name: "Lightning Bolt", confident: true });
    expect(matchName(index, "Atraxa Praetors Voice")).toMatchObject({ name: "Atraxa, Praetors' Voice", confident: true });
    expect(matchName(index, "Delver of Secrets")).toMatchObject({ name: "Delver of Secrets // Insectile Aberration", confident: true });
  });

  it("ist vorsichtig bei unklaren Lesungen", () => {
    expect(matchName(index, "Lightning")?.confident).toBe(false); // Bolt? Helix?
    expect(matchName(index, "l lanes Flves")?.confident ?? false).toBe(false);
    expect(matchName(index, "xq")).toBeNull();
  });

  it("Teil-Abstand erlaubt abgeschnittene Anfänge/Enden", () => {
    expect(partialDistance("htningbolt", "lightningbolt")).toBe(0);
    expect(readScore("htningbolt", "lightningbolt")).toBeGreaterThan(0.9);
    expect(readScore("bolt", "lightningbolt")).toBeLessThan(0.5);
  });
});
