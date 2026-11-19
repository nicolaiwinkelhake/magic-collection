import { describe, expect, it } from "vitest";
import { confirmDim, CONFIRM_MS, mean } from "@/lib/scanLight";

describe("wenig Licht", () => {
  it("bei gutem Licht sofort annehmen", () => {
    expect(confirmDim(null, "Shock", 0, false)).toEqual({ accept: true, pending: null });
  });
  it("bei wenig Licht erst beim zweiten gleichen Namen", () => {
    const a = confirmDim(null, "Shock", 1000, true);
    expect(a.accept).toBe(false);
    expect(confirmDim(a.pending, "Shock", 1800, true).accept).toBe(true);
    expect(confirmDim(a.pending, "Shack", 1800, true).accept).toBe(false);
    expect(confirmDim(a.pending, "Shock", 1000 + CONFIRM_MS + 1, true).accept).toBe(false);
  });
  it("Mittelwert", () => {
    expect(mean(new Float32Array([10, 20, 30]))).toBe(20);
  });
});
