import { describe, expect, it } from "vitest";
import { detectQuad, quadPoint, warpArea, type Quad } from "@/lib/cardQuad";

// Graubild mit gedrehter "Karte": heller Rand außen, dunkler Rahmen, helles Inneres
function scene(w: number, h: number, cx: number, cy: number, cw: number, deg: number, opts: { bg?: number; border?: number } = {}) {
  const g = new Float32Array(w * h).fill(opts.bg ?? 150);
  const ch = cw * (88 / 63);
  const a = (deg * Math.PI) / 180;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const u = (dx * Math.cos(a) + dy * Math.sin(a)) / cw + 0.5;
      const v = (-dx * Math.sin(a) + dy * Math.cos(a)) / ch + 0.5;
      if (u < 0 || u > 1 || v < 0 || v > 1) continue;
      const inner = u > 0.046 && u < 0.954 && v > 0.036 && v < 0.928;
      g[y * w + x] = inner ? 200 + 30 * Math.sin(u * 40) * Math.sin(v * 30) : opts.border ?? 25;
    }
  const corner = (u: number, v: number) => ({
    x: cx + (u - 0.5) * cw * Math.cos(a) - (v - 0.5) * ch * Math.sin(a),
    y: cy + (u - 0.5) * cw * Math.sin(a) + (v - 0.5) * ch * Math.cos(a),
  });
  return { g, truth: [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)] as Quad };
}
const maxErr = (a: Quad, b: Quad) => Math.max(...a.map((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y)));

describe("detectQuad", () => {
  it("findet eine gerade Karte", () => {
    const { g, truth } = scene(180, 320, 90, 150, 110, 0);
    const q = detectQuad(g, 180, 320)!;
    expect(q).not.toBeNull();
    expect(maxErr(q, truth)).toBeLessThan(4);
  });
  it("findet eine schräg liegende Karte samt Ecken", () => {
    for (const deg of [-7, -4, 5, 8]) {
      const { g, truth } = scene(180, 320, 92, 155, 105, deg);
      const q = detectQuad(g, 180, 320)!;
      expect(q, `bei ${deg}°`).not.toBeNull();
      expect(maxErr(q, truth), `bei ${deg}°`).toBeLessThan(5);
    }
  });
  it("rechnet vom inneren Rahmen auf den Kartenrand hoch (dunkler Tisch)", () => {
    const { g, truth } = scene(180, 320, 90, 150, 110, 3, { bg: 28, border: 22 });
    const q = detectQuad(g, 180, 320)!;
    expect(q).not.toBeNull();
    expect(maxErr(q, truth)).toBeLessThan(6);
  });
  it("findet nichts ohne Karte", () => {
    const g = new Float32Array(180 * 320).fill(120);
    for (let i = 0; i < g.length; i++) g[i] += (i * 7919) % 13;
    expect(detectQuad(g, 180, 320)).toBeNull();
  });
});

describe("warpArea", () => {
  it("entzerrt einen Bereich", () => {
    // 4×4-Bild, Spalte 2+3 weiß; Viereck = ganzes Bild
    const data = new Uint8ClampedArray(4 * 4 * 4);
    for (let y = 0; y < 4; y++) for (let x = 2; x < 4; x++) data.set([255, 255, 255, 255], (y * 4 + x) * 4);
    const q: Quad = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 3 }, { x: 0, y: 3 }];
    const out = warpArea({ data, width: 4, height: 4 }, q, { x: 0.75, y: 0, w: 0.25, h: 1 }, 2, 2);
    expect(out[0]).toBeGreaterThan(200);
    expect(quadPoint(q, 0.5, 0.5)).toEqual({ x: 1.5, y: 1.5 });
  });
});
