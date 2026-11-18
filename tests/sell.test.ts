import { describe, expect, it } from "vitest";
import { adText, bundleSuggestion, cardmarketSuggestion, itemLine, marketPrice, marketTotal, splitRevenue } from "@/lib/sell";

const card = (o: Partial<Parameters<typeof marketPrice>[0]> = {}) => ({
  name: "Sol Ring", set_code: "c13", collector_number: "259", foil: false, condition: "NM", language: "EN",
  price_eur: 1, price_eur_foil: 4, ...o,
});

describe("Preise", () => {
  it("nimmt Foil-Preis bei Foil und bereinigt den Zustand", () => {
    expect(marketPrice(card())).toBe(1);
    expect(marketPrice(card({ foil: true }))).toBe(4);
    expect(marketPrice(card({ condition: "MP" }))).toBe(0.75);
    expect(marketPrice(card({ price_eur: null }))).toBeNull();
  });
  it("Cardmarket-Vorschlag mindestens 0,02 €", () => {
    expect(cardmarketSuggestion(card({ price_eur: 0.01 }))).toBe(0.02);
  });
  it("Kleinanzeigen-Bündel: ~10 % unter Markt, gerundet", () => {
    expect(bundleSuggestion(57.3)).toBe(50);
    expect(bundleSuggestion(8.4)).toBe(7);
    expect(bundleSuggestion(0.5)).toBe(1);
    expect(bundleSuggestion(0)).toBe(0);
    expect(marketTotal([{ card: card(), quantity: 3 }])).toBe(3);
  });
});

describe("Texte", () => {
  it("Zeile mit Druck, Foil, Zustand, Sprache", () => {
    expect(itemLine({ card: card({ foil: true, language: "DE", condition: "LP" }), quantity: 2 })).toBe(
      "2× Sol Ring (C13 #259) – Foil – Lightly Played – Deutsch",
    );
  });
  it("Anzeige mit Titel, Liste und VB", () => {
    const t = adText("Elfen-Bundle", [{ card: card(), quantity: 2 }], 25);
    expect(t.title).toBe("Magic: The Gathering – Elfen-Bundle (2 Karten)");
    expect(t.description).toContain("• 2× Sol Ring (C13 #259) – Near Mint – Englisch");
    expect(t.description).toContain("Preis für alles: 25,00 € VB.");
  });
});

describe("splitRevenue", () => {
  it("verteilt den Erlös anteilig, Summe stimmt", () => {
    const items = [{ card: card({ price_eur: 3 }), quantity: 1 }, { card: card({ price_eur: 1 }), quantity: 2 }];
    const per = splitRevenue(10, items);
    expect(per[0] * 1 + per[1] * 2).toBeCloseTo(10, 1);
    expect(per[0]).toBeCloseTo(6, 1);
  });
});
