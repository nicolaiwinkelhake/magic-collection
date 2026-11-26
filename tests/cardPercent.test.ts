import { describe, expect, it } from "vitest";
import { cardPercent, formatPercentShort } from "@/lib/priceChange";

const card = (o: Partial<{ foil: boolean; price_eur: number | null; price_eur_foil: number | null }> = {}) => ({
  scryfall_id: "a",
  quantity: 3,
  foil: false,
  condition: "NM",
  price_eur: 11,
  price_eur_foil: null,
  ...o,
});

describe("cardPercent", () => {
  it("vergleicht je Exemplar, unabhängig von der Menge", () => {
    expect(cardPercent(card(), { a: [10, null] })).toBeCloseTo(10);
  });
  it("nutzt bei Foil den Foil-Preis, sonst den Normalpreis", () => {
    expect(cardPercent(card({ foil: true, price_eur_foil: 4 }), { a: [1, 5] })).toBeCloseTo(-20);
    expect(cardPercent(card({ price_eur: null, price_eur_foil: 6 }), { a: [null, 5] })).toBeCloseTo(20);
  });
  it("ohne früheren Preis oder bei Kleinstbeträgen keine Angabe", () => {
    expect(cardPercent(card(), { b: [1, 1] })).toBeNull();
    expect(cardPercent(card(), undefined)).toBeNull();
    expect(cardPercent(card({ price_eur: 0.1 }), { a: [0.02, null] })).toBeNull();
  });
});

describe("formatPercentShort", () => {
  it("rundet auf ganze Prozent, unter 0,5 % ~0", () => {
    expect(formatPercentShort(11.4)).toBe("+11 %");
    expect(formatPercentShort(-8.6)).toBe("−9 %");
    expect(formatPercentShort(0.3)).toBe("~0 %");
    expect(formatPercentShort(-0.4)).toBe("~0 %");
    expect(formatPercentShort(1234)).toBe("+1.234 %");
  });
});
