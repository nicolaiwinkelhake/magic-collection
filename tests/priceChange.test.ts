import { describe, expect, it } from "vitest";
import { dayString, formatPercent, priceChange } from "@/lib/priceChange";

const card = (id: string, eur: number | null, foil = false, quantity = 1, eurFoil: number | null = null) => ({
  scryfall_id: id, price_eur: eur, price_eur_foil: eurFoil, foil, quantity, condition: "NM",
});

describe("priceChange", () => {
  it("vergleicht dieselben Karten mit ihrem früheren Preis", () => {
    const r = priceChange([card("a", 12, false, 2), card("b", 5)], { a: [10, null], b: [5, null] });
    expect(r?.percent).toBeCloseTo((29 - 25) / 25 * 100);
    expect(r?.delta).toBe(4);
    expect(r?.matched).toBe(2);
  });

  it("zählt Karten ohne früheren Preis nicht mit (neue Karten sind kein Gewinn)", () => {
    const r = priceChange([card("a", 11), card("neu", 100)], { a: [10, null] });
    expect(r?.percent).toBeCloseTo(10);
    expect(r?.matched).toBe(1);
    expect(r?.total).toBe(2);
  });

  it("nimmt bei Foil den Foil-Preis, sonst den normalen", () => {
    const r = priceChange([card("a", 1, true, 1, 6)], { a: [1, 4] });
    expect(r?.percent).toBeCloseTo(50);
  });

  it("zeigt nichts ohne Grundlage", () => {
    expect(priceChange([card("a", 1)], undefined)).toBeNull();
    expect(priceChange([card("a", 1)], {})).toBeNull();
  });
});

describe("formatPercent", () => {
  it("formatiert deutsch mit Vorzeichen", () => {
    expect(formatPercent(3.24)).toBe("+3,2 %");
    expect(formatPercent(-0.44)).toBe("−0,4 %");
    expect(formatPercent(0.01)).toBe("±0 %");
  });
});

describe("dayString", () => {
  it("rechnet in UTC-Tagen zurück", () => {
    expect(dayString(7, new Date("2026-11-18T08:00:00Z"))).toBe("2026-11-11");
    expect(dayString(1, new Date("2026-03-01T00:30:00Z"))).toBe("2026-02-28");
  });
});
