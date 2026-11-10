import { describe, expect, it } from "vitest";
import { cardHash, hamming, pickBest } from "@/lib/imageHash";

const W = 63;
const H = 88;
// "Karte" aus Mustern; seed variiert das Artwork
function card(seed: number, brightness = 0, frame = 0) {
  const g = new Float32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let v = 128 + 100 * Math.sin((x * (seed + 1)) / 7 + (y * (seed + 2)) / 11);
      if (y < H * 0.12 || y > H * 0.6) v = 200 - frame * ((x * 3 + y) % 50); // Rahmen
      g[y * W + x] = Math.max(0, Math.min(255, v + brightness));
    }
  return g;
}

describe("imageHash", () => {
  it("gleich trotz anderer Helligkeit", () => {
    expect(hamming(cardHash(card(1), W, H), cardHash(card(1, 30), W, H))).toBeLessThanOrEqual(4);
  });

  it("anderes Artwork oder anderer Rahmen unterscheidet sich deutlich", () => {
    const a = cardHash(card(1), W, H);
    expect(hamming(a, cardHash(card(4), W, H))).toBeGreaterThan(20);
    expect(hamming(a, cardHash(card(1, 0, 2), W, H))).toBeGreaterThan(10);
  });

  it("pickBest wählt eindeutig, sonst nichts", () => {
    const target = cardHash(card(2, 10), W, H);
    const prints = [1, 2, 3, 5].map((s) => ({ id: `p${s}`, hash: cardHash(card(s), W, H) }));
    expect(pickBest(target, prints)?.best.id).toBe("p2");
    // zwei gleiche Kandidaten → nicht eindeutig
    const twins = [{ id: "a", hash: cardHash(card(2), W, H) }, { id: "b", hash: cardHash(card(2), W, H) }];
    expect(pickBest(target, twins)).toBeNull();
    expect(pickBest(target, [])).toBeNull();
  });
});
