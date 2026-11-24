import { describe, expect, it } from "vitest";
import { applyTrendPrices, parsePriceGuide, type TrendPrice } from "@/lib/cardmarket";

describe("Cardmarket-Preisliste", () => {
  it("liest Trend und Trend-Foil, ignoriert leere und ungültige Werte", () => {
    const { createdAt, prices } = parsePriceGuide({
      createdAt: "2026-11-24T02:45:06+0100",
      priceGuides: [
        { idProduct: 1, trend: 0.02, "trend-foil": 0.36, avg: 0.07 },
        { idProduct: 2, trend: 0, "trend-foil": 1.234 },
        { idProduct: 3, trend: null, "trend-foil": 0 },
        { idProduct: "x", trend: 5 },
      ],
    });
    expect(createdAt).toBe("2026-11-24T02:45:06+0100");
    expect(prices.get(1)).toEqual({ eur: 0.02, eurFoil: 0.36 });
    expect(prices.get(2)).toEqual({ eur: null, eurFoil: 1.23 });
    expect(prices.has(3)).toBe(false);
    expect(prices.size).toBe(2);
  });

  it("Trendpreise ersetzen den Scryfall-Stand, fehlende Seite bleibt", () => {
    const prices = new Map<string, TrendPrice>([
      ["a", { eur: 24.16, eurFoil: 21 }],
      ["b", { eur: 1, eurFoil: 3 }],
      ["c", { eur: 2, eurFoil: null }],
    ]);
    const guide = new Map<number, TrendPrice>([
      [917894, { eur: 24.31, eurFoil: null }],
      [5, { eur: 1.5, eurFoil: 2.5 }],
      [7, { eur: 9, eurFoil: 9 }],
    ]);
    const applied = applyTrendPrices(prices, new Map([["a", 917894], ["b", 5], ["c", 999], ["d", 7]]), guide);
    expect(applied).toBe(3);
    expect(prices.get("a")).toEqual({ eur: 24.31, eurFoil: 21 });
    expect(prices.get("b")).toEqual({ eur: 1.5, eurFoil: 2.5 });
    expect(prices.get("c")).toEqual({ eur: 2, eurFoil: null });
    expect(prices.get("d")).toEqual({ eur: 9, eurFoil: 9 });
  });
});
