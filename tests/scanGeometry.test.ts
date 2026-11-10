import { describe, expect, it } from "vitest";
import { CARD_RATIO, coverGuide } from "@/lib/scanGeometry";

describe("coverGuide", () => {
  it("Hochformat-Video auf Hochformat-Bildschirm: Rahmen im Kartenformat, mittig", () => {
    const g = coverGuide(1080, 1920, 390, 844);
    const pxW = g.video.w * 1080;
    const pxH = g.video.h * 1920;
    expect(pxW / pxH).toBeCloseTo(CARD_RATIO, 3);
    expect(g.screen.x + g.screen.w / 2).toBeCloseTo(0.5, 3);
  });

  it("Querformat-Video wird beschnitten – Rahmen liegt im sichtbaren Teil", () => {
    const g = coverGuide(1920, 1080, 390, 844);
    // sichtbare Breite in Videopixeln
    const scale = Math.max(390 / 1920, 844 / 1080);
    const visW = 390 / scale;
    const visX = (1920 - visW) / 2;
    expect(g.video.x * 1920).toBeGreaterThanOrEqual(visX - 0.5);
    expect((g.video.x + g.video.w) * 1920).toBeLessThanOrEqual(visX + visW + 0.5);
    expect(g.screen.x).toBeGreaterThan(0);
    expect(g.screen.x + g.screen.w).toBeLessThan(1);
  });
});

import { fromVisible, visibleRegion } from "@/lib/scanGeometry";

describe("visibleRegion / fromVisible", () => {
  it("Querformat-Video im Hochformat: nur die Mitte ist sichtbar", () => {
    const vis = visibleRegion(1920, 1080, 390, 844);
    expect(vis.y).toBeCloseTo(0, 5);
    expect(vis.h).toBeCloseTo(1, 5);
    expect(vis.x).toBeGreaterThan(0.3);
    // Mitte des sichtbaren Bereichs = Mitte des Videos
    const mid = fromVisible({ x: 0.5, y: 0.5, w: 0, h: 0 }, vis);
    expect(mid.x).toBeCloseTo(0.5, 5);
    // ganzer sichtbarer Bereich = vis
    expect(fromVisible({ x: 0, y: 0, w: 1, h: 1 }, vis)).toEqual(vis);
  });
});
