import { describe, expect, it } from "vitest";
import { nextTickMs, PACE, sameRect } from "@/lib/scanPace";

describe("Takt der Scan-Automatik", () => {
  it("schnell nur, wenn eine ungelesene Karte daliegt", () => {
    expect(nextTickMs({ hidden: false, present: true, armed: true })).toBe(PACE.fast);
    expect(nextTickMs({ hidden: false, present: false, armed: true })).toBe(PACE.idle);
    expect(nextTickMs({ hidden: false, present: true, armed: false })).toBe(PACE.waiting);
    expect(nextTickMs({ hidden: true, present: true, armed: true })).toBe(PACE.hidden);
  });
  it("Rahmen nur bei echter Bewegung neu zeichnen", () => {
    const r = { x: 0.1, y: 0.2, w: 0.5, h: 0.6 };
    expect(sameRect(r, { ...r, x: 0.102 })).toBe(true);
    expect(sameRect(r, { ...r, x: 0.11 })).toBe(false);
    expect(sameRect(null, null)).toBe(true);
    expect(sameRect(r, null)).toBe(false);
  });
});
