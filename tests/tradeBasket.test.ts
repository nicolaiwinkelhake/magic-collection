import { describe, expect, it } from "vitest";
import { addToBasket, basketCount, basketPayload, basketValue, setBasketQty, type BasketCard } from "@/lib/tradeBasket";

const card = (id: string, quantity: number, price: number | null, foil = false, foilPrice: number | null = null): BasketCard => ({
  id,
  name: id,
  image_url: null,
  foil,
  quantity,
  price_eur: price,
  price_eur_foil: foilPrice,
});

describe("tradeBasket", () => {
  it("fügt hinzu und zählt hoch, aber nie über den Bestand", () => {
    let b = addToBasket([], [card("a", 2, 1)]);
    b = addToBasket(b, [card("a", 2, 1), card("b", 1, 5)]);
    b = addToBasket(b, [card("a", 2, 1), card("b", 1, 5)]);
    expect(b.map((x) => [x.card.id, x.qty])).toEqual([["a", 2], ["b", 1]]);
  });

  it("setzt Mengen im erlaubten Bereich, 0 entfernt", () => {
    let b = addToBasket([], [card("a", 3, 1), card("b", 1, 1)]);
    b = setBasketQty(b, "a", 10);
    expect(b[0].qty).toBe(3);
    b = setBasketQty(b, "a", 0);
    expect(b.map((x) => x.card.id)).toEqual(["b"]);
  });

  it("berechnet Anzahl, Wert (Foil-Preis) und Nutzlast", () => {
    let b = addToBasket([], [card("a", 4, 2), card("f", 1, 1, true, 5), card("n", 1, null)]);
    b = setBasketQty(b, "a", 3);
    expect(basketCount(b)).toBe(5);
    expect(basketValue(b)).toBe(11);
    expect(basketPayload(b)).toEqual([
      { id: "a", quantity: 3 },
      { id: "f", quantity: 1 },
      { id: "n", quantity: 1 },
    ]);
  });
});
