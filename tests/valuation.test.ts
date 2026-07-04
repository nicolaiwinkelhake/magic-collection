import { describe, it, expect } from "vitest";
import {
  basePrice,
  conditionFactor,
  cardValue,
  totalValue,
} from "@/lib/valuation";

describe("basePrice", () => {
  it("nimmt für Foil den Foil-Preis", () => {
    expect(basePrice({ quantity: 1, foil: true, price_eur: 2, price_eur_foil: 5 })).toBe(5);
  });
  it("fällt bei fehlendem Foil-Preis auf den Normalpreis zurück", () => {
    expect(basePrice({ quantity: 1, foil: true, price_eur: 2, price_eur_foil: null })).toBe(2);
  });
  it("gibt 0 bei fehlenden Preisen", () => {
    expect(basePrice({ quantity: 1, foil: false, price_eur: null, price_eur_foil: null })).toBe(0);
  });
});

describe("conditionFactor", () => {
  it("NM = 1.0, DMG = 0.4", () => {
    expect(conditionFactor("NM")).toBe(1);
    expect(conditionFactor("DMG")).toBe(0.4);
  });
  it("unbekannt/fehlend wird wie NM behandelt", () => {
    expect(conditionFactor(undefined)).toBe(1);
    expect(conditionFactor("XX")).toBe(1);
  });
});

describe("cardValue", () => {
  it("multipliziert Preis × Zustand × Menge", () => {
    expect(
      cardValue({ quantity: 2, foil: false, price_eur: 10, price_eur_foil: null, condition: "MP" })
    ).toBe(15); // 10 × 0.75 × 2
  });
  it("rundet auf Cent", () => {
    expect(
      cardValue({ quantity: 1, foil: false, price_eur: 0.33, price_eur_foil: null, condition: "LP" })
    ).toBe(0.3); // 0.297 → 0.30
  });
});

describe("totalValue", () => {
  it("summiert über alle Karten", () => {
    const cards = [
      { quantity: 1, foil: false, price_eur: 10, price_eur_foil: null, condition: "NM" },
      { quantity: 2, foil: false, price_eur: 5, price_eur_foil: null, condition: "HP" },
    ];
    expect(totalValue(cards)).toBe(16); // 10 + 5×0.6×2
  });
});
