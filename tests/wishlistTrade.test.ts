import { describe, expect, it } from "vitest";
import { basketFromFriendCopies } from "@/lib/wishlistTrade";
import type { BasketCard } from "@/lib/tradeBasket";

const card = (id: string, name: string, o: Partial<BasketCard> = {}): BasketCard => ({
  id, name, image_url: null, foil: false, quantity: 1, price_eur: 1, price_eur_foil: null, ...o,
});

describe("Wunschliste: Trade-Korb", () => {
  it("legt je Karte ein Exemplar mit Menge 1 in den Korb", () => {
    const { basket, missing } = basketFromFriendCopies([card("a", "Sol Ring", { quantity: 3 }), card("b", "Cultivate")], ["Sol Ring", "Cultivate"]);
    expect(basket.map((b) => [b.card.name, b.qty])).toEqual([["Sol Ring", 1], ["Cultivate", 1]]);
    expect(missing).toEqual([]);
  });
  it("bevorzugt Nicht-Foil, dann das günstigere Exemplar", () => {
    const rows = [
      card("foil", "Sol Ring", { foil: true, price_eur: 0.5, price_eur_foil: 0.4 }),
      card("teuer", "Sol Ring", { price_eur: 3 }),
      card("billig", "Sol Ring", { price_eur: 1 }),
    ];
    expect(basketFromFriendCopies(rows, ["Sol Ring"]).basket[0].card.id).toBe("billig");
  });
  it("nimmt Foil, wenn es nur Foil gibt", () => {
    expect(basketFromFriendCopies([card("f", "Mana Crypt", { foil: true, price_eur: null, price_eur_foil: 90 })], ["Mana Crypt"]).basket[0].card.id).toBe("f");
  });
  it("meldet Karten, die der Freund nicht (mehr) hat, und ignoriert Bestand 0", () => {
    const { basket, missing } = basketFromFriendCopies([card("a", "Sol Ring", { quantity: 0 }), card("b", "Cultivate")], ["Sol Ring", "Cultivate", "Counterspell"]);
    expect(basket.map((b) => b.card.name)).toEqual(["Cultivate"]);
    expect(missing).toEqual(["Sol Ring", "Counterspell"]);
  });
  it("doppelte Wunschnamen zählen einmal", () => {
    expect(basketFromFriendCopies([card("a", "Sol Ring")], ["Sol Ring", "Sol Ring"]).basket).toHaveLength(1);
  });
});
