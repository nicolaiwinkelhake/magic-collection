import { describe, expect, it } from "vitest";
import { listVerdict, matchTemplate, regionFrom, regionSize, stripDescriptor, STRIP_H, STRIP_W } from "@/lib/listIcon";

// kleines Graubild → RGBA
const rgba = (w: number, h: number, f: (x: number, y: number) => number) => {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = f(x, y);
    d.set([v, v, v, 255], (y * w + x) * 4);
  }
  return d;
};
// Vorlagen: „The List“ = helles Symbol links auf Schwarz + Ziffern rechts; Original = nur Ziffern
const digits = (x: number, y: number) => (x >= 12 && x < 19 && y >= 10 && y < 30 && (x + y) % 3 === 0 ? 200 : 20);
const icon = (x: number, y: number) => (x >= 3 && x < 9 && y >= 14 && y < 26 ? 230 : 0);
const listT = stripDescriptor(rgba(STRIP_W, STRIP_H, (x, y) => Math.max(digits(x, y), icon(x, y))));
const origT = stripDescriptor(rgba(STRIP_W, STRIP_H, digits));

/** Kamerabild: Vorlage versetzt in einen größeren Bereich gelegt, mit Rauschen */
function cam(withIcon: boolean, dx: number, dy: number) {
  const { w, h } = regionSize();
  let seed = 7;
  const noise = () => ((seed = (seed * 16807) % 2147483647) % 21) - 10;
  return regionFrom(
    rgba(w, h, (x, y) => {
      const lx = x - dx, ly = y - dy;
      const inside = lx >= 0 && lx < STRIP_W && ly >= 0 && ly < STRIP_H;
      const v = inside ? Math.max(digits(lx, ly), withIcon ? icon(lx, ly) : 0) : 20;
      return Math.max(0, Math.min(255, v * 0.8 + 30 + noise()));
    }),
    w,
    h,
  );
}

describe("The-List-Symbol", () => {
  it("Vorlage ist mittelwertfrei und normiert", () => {
    expect(listT.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 4);
    expect(Math.sqrt(listT.reduce((a, b) => a + b * b, 0))).toBeCloseTo(1, 4);
  });
  it("findet die Vorlage auch versetzt (ungenaue Kartenkanten)", () => {
    expect(matchTemplate(cam(true, 9, 15), listT)).toBeGreaterThan(0.9);
  });
  it("mit Symbol → The List, ohne Symbol → Original", () => {
    expect(listVerdict(cam(true, 6, 12), listT, origT).verdict).toBe("list");
    expect(listVerdict(cam(false, 6, 12), listT, origT).verdict).toBe("orig");
  });
  it("gleichmäßige Fläche: keine Entscheidung", () => {
    const { w, h } = regionSize();
    expect(listVerdict(regionFrom(rgba(w, h, () => 30), w, h), listT, origT).verdict).toBe("unclear");
  });
});
