import { describe, expect, it } from "vitest";
import { levels, normalizeGray } from "@/lib/grayLevels";

describe("Helligkeit angleichen", () => {
  it("streckt ein dunkles, flaues Bild", () => {
    const g = new Float32Array(1000).map((_, i) => 20 + (i % 50)); // 20..69
    const out = normalizeGray(g);
    const l = levels(out);
    expect(l.lo).toBeLessThan(10);
    expect(l.hi).toBeGreaterThan(240);
  });
  it("lässt gut belichtete und leere Bilder in Ruhe", () => {
    const good = new Float32Array(1000).map((_, i) => (i % 256));
    expect(normalizeGray(good)).toBe(good);
    const flat = new Float32Array(100).fill(30);
    expect(normalizeGray(flat)).toBe(flat);
  });
});
