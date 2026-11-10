import { describe, expect, it } from "vitest";
import { detectCard } from "@/lib/cardDetect";

const W = 120;
const H = 160;

// Hintergrund (optional unruhig) + Karte mit dunklem Rand und hellen Feldern
function scene(card: { x: number; y: number; w: number } | null, noise = 0, seed = 1, stripes = false, blob = false) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const g = new Float32Array(W * H);
  for (let i = 0; i < g.length; i++) g[i] = 150 + (rnd() - 0.5) * noise;
  // Holzmaserung: lange waagerechte Streifen über das ganze Bild
  if (stripes) for (let y = 0; y < H; y += 9) for (let x = 0; x < W; x++) { g[y * W + x] = 95; g[(y + 1) * W + x] = 95; }
  if (card) {
    const ch = Math.round(card.w / (63 / 88));
    for (let y = card.y; y < card.y + ch; y++)
      for (let x = card.x; x < card.x + card.w; x++) {
        const ix = x - card.x;
        const iy = y - card.y;
        const inner = ix > 3 && ix < card.w - 4 && iy > 3 && iy < ch - 4;
        // Namensbalken, Bild, Textbox
        let v = 25;
        if (inner && iy < ch * 0.1) v = 220;
        else if (inner && iy < ch * 0.55) v = 90;
        else if (inner && iy > ch * 0.6 && iy < ch * 0.92) v = 210;
        g[y * W + x] = v;
      }
    // Motiv, das über den linken Kartenrand hinausragt
    if (blob)
      for (let y = card.y + 20; y < card.y + 32; y++)
        for (let x = card.x - 4; x < card.x + 10; x++) g[y * W + x] = 60;
  }
  return g;
}

function expectNear(r: ReturnType<typeof detectCard>, card: { x: number; y: number; w: number }, tol = 2) {
  expect(r).not.toBeNull();
  const ch = Math.round(card.w / (63 / 88));
  expect(Math.abs(r!.x * W - card.x)).toBeLessThanOrEqual(tol);
  expect(Math.abs(r!.y * H - card.y)).toBeLessThanOrEqual(tol);
  expect(Math.abs(r!.w * W - card.w)).toBeLessThanOrEqual(tol + 1);
  expect(Math.abs(r!.h * H - ch)).toBeLessThanOrEqual(tol + 1);
}

describe("detectCard", () => {
  it("findet eine mittige Karte", () => {
    const card = { x: 25, y: 20, w: 70 };
    expectNear(detectCard(scene(card), W, H), card);
  });

  it("findet eine verschobene Karte", () => {
    const card = { x: 8, y: 50, w: 60 };
    expectNear(detectCard(scene(card), W, H), card);
  });

  it("verkraftet unruhigen Hintergrund", () => {
    const card = { x: 30, y: 25, w: 66 };
    expectNear(detectCard(scene(card, 40, 7), W, H), card);
  });

  it("verkraftet Holzmaserung und Motiv über dem Rand", () => {
    const card = { x: 30, y: 30, w: 64 };
    // Maserungslinie 4 px über der Karte: ±4 px (≈3 %) genügen fürs Lesen
    expectNear(detectCard(scene(card, 20, 5, true, true), W, H), card, 4);
  });

  it("ohne Karte kein Treffer – auch nicht bei Maserung", () => {
    expect(detectCard(scene(null, 20, 9, true), W, H)).toBeNull();
  });

  it("ohne Karte kein Treffer", () => {
    expect(detectCard(scene(null), W, H)).toBeNull();
    expect(detectCard(scene(null, 60, 3), W, H)).toBeNull();
  });

  it("zu kleine Karte wird ignoriert", () => {
    expect(detectCard(scene({ x: 40, y: 40, w: 20 }), W, H)).toBeNull();
  });
});
