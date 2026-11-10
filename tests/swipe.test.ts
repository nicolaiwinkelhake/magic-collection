import { describe, expect, it } from "vitest";
import { neighborIndex, swipeStep } from "@/lib/swipe";

describe("swipeStep", () => {
  it("links wischen = nächste, rechts = vorherige", () => {
    expect(swipeStep(-100, 5)).toBe(1);
    expect(swipeStep(100, 5)).toBe(-1);
  });
  it("kurze oder senkrechte Bewegungen zählen nicht", () => {
    expect(swipeStep(-30, 0)).toBe(0);
    expect(swipeStep(-80, 120)).toBe(0);
  });
});

describe("neighborIndex", () => {
  it("bleibt in den Grenzen", () => {
    expect(neighborIndex(0, -1, 3)).toBeNull();
    expect(neighborIndex(2, 1, 3)).toBeNull();
    expect(neighborIndex(1, 1, 3)).toBe(2);
    expect(neighborIndex(-1, 1, 3)).toBeNull();
  });
});
