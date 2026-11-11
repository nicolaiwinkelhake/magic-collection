import { describe, expect, it } from "vitest";
import { printMatchesRead } from "@/lib/scryfallDirect";

describe("printMatchesRead", () => {
  it("ohne lesbaren Namen zählt Set + Nummer allein", () => {
    expect(printMatchesRead([], ["Lightning Bolt"])).toBe(true);
    expect(printMatchesRead(["EE"], ["Lightning Bolt"])).toBe(true);
  });
  it("toleriert angeschnittene/verlesene Namen", () => {
    expect(printMatchesRead(["thtning Bolt"], ["Lightning Bolt"])).toBe(true);
    expect(printMatchesRead(["hitnina Bolt"], ["Lightning Bolt"])).toBe(true);
  });
  it("erkennt verlesene Nummer (anderer Name)", () => {
    expect(printMatchesRead(["Counterspell"], ["Lightning Bolt"])).toBe(false);
  });
  it("vergleicht auch den gedruckten (deutschen) Namen", () => {
    expect(printMatchesRead(["Blitzschlag"], ["Lightning Bolt", "Blitzschlag"])).toBe(true);
    expect(printMatchesRead(["Delver der Geheimnisse"], ["Delver of Secrets // Insectile Aberration", undefined, "Delver der Geheimnisse"])).toBe(true);
  });
});
