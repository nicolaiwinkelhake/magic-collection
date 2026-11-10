import { describe, expect, it } from "vitest";
import { contrast, frameDiff, initialWatch, markScanned, toGray, watchFrame } from "@/lib/frameWatch";

const flat = (v: number, n = 100) => new Float32Array(n).fill(v);
const pattern = (offset = 0, n = 100) => Float32Array.from({ length: n }, (_, i) => ((i + offset) % 10) * 25);

describe("frameWatch", () => {
  it("Graustufen und Differenz", () => {
    expect(Array.from(toGray(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255])))).toEqual([255, 0]);
    expect(frameDiff(flat(10), flat(20))).toBe(10);
    expect(contrast(flat(100))).toBe(0);
    expect(contrast(pattern())).toBeGreaterThan(50);
  });

  it("liest erst bei ruhigem Bild mit Karte", () => {
    let st = initialWatch();
    let r = watchFrame(st, pattern());
    expect(r.shouldScan).toBe(false);
    r = watchFrame(r.state, pattern());
    expect(r.shouldScan).toBe(false);
    r = watchFrame(r.state, pattern());
    expect(r.shouldScan).toBe(true);
  });

  it("leere Fläche löst nichts aus", () => {
    let r = { state: initialWatch(), shouldScan: false };
    for (let i = 0; i < 5; i++) r = watchFrame(r.state, flat(120));
    expect(r.shouldScan).toBe(false);
  });

  it("nach einem Scan erst wieder nach Kartenwechsel", () => {
    let r = { state: initialWatch(), shouldScan: false };
    for (let i = 0; i < 3; i++) r = watchFrame(r.state, pattern());
    let st = markScanned(r.state, pattern());
    for (let i = 0; i < 5; i++) {
      r = watchFrame(st, pattern());
      st = r.state;
      expect(r.shouldScan).toBe(false);
    }
    // andere Karte liegt still
    for (let i = 0; i < 3; i++) {
      r = watchFrame(st, pattern(5));
      st = r.state;
    }
    expect(r.shouldScan).toBe(true);
  });
});
