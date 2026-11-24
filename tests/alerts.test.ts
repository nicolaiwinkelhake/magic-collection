import { describe, expect, it } from "vitest";
import { diffWishlistMatches, priceMovers, type DayPrices } from "@/lib/alerts";
import { listOf, messages } from "@/lib/pushMessages";

const m = (user_id: string, owner_id: string, card_name: string) => ({ user_id, owner_id, owner_email: `${owner_id}@x.de`, card_name });

describe("Wunschliste bei Freunden", () => {
  it("meldet nur Neues, merkt es sich und vergisst Verschwundenes", () => {
    const { byUser, remember, forget } = diffWishlistMatches(
      [m("u1", "nils", "Sol Ring"), m("u1", "rene", "Sol Ring"), m("u2", "nils", "Rhystic Study")],
      [
        { user_id: "u1", owner_id: "nils", card_name: "Sol Ring" },
        { user_id: "u1", owner_id: "nils", card_name: "Mana Crypt" },
      ],
    );
    expect([...byUser.keys()].sort()).toEqual(["u1", "u2"]);
    expect(byUser.get("u1")!.map((h) => h.owner_id)).toEqual(["rene"]);
    expect(remember).toHaveLength(2);
    expect(forget).toEqual([{ user_id: "u1", owner_id: "nils", card_name: "Mana Crypt" }]);
  });

  it("Mitteilungstext für eine und mehrere Karten", () => {
    expect(messages.wishlistAvailable([{ card: "Sol Ring", owner: "nils" }]).title).toBe("Sol Ring gibt's bei nils");
    const many = messages.wishlistAvailable([
      { card: "Sol Ring", owner: "nils" },
      { card: "Rhystic Study", owner: "rene" },
      { card: "Sol Ring", owner: "rene" },
    ]);
    expect(many.title).toBe("2 Wunschkarten bei Freunden");
    expect(many.body).toBe("Sol Ring und Rhystic Study – bei nils und rene.");
    expect(listOf(["a", "b", "c", "d", "e"])).toBe("a, b, c und 2 weitere");
  });
});

describe("Preisbewegungen", () => {
  const today: DayPrices = new Map([
    ["a", { eur: 12, eurFoil: 30 }],
    ["b", { eur: 1.5, eurFoil: null }],
    ["c", { eur: 5, eurFoil: null }],
  ]);
  const yesterday: DayPrices = new Map([
    ["a", { eur: 9, eurFoil: 30 }],
    ["b", { eur: 1, eurFoil: null }],
    ["c", { eur: 8, eurFoil: null }],
  ]);
  const card = (scryfall_id: string, name: string, quantity = 1, extra = {}) => ({ user_id: "u1", scryfall_id, name, quantity, foil: false, ...extra });

  it("meldet starke Ausreißer (≥ 2 € und ≥ 15 % je Exemplar), Gesamtänderung über alles", () => {
    const res = priceMovers([card("a", "Sol Ring", 2), card("b", "Opt"), card("c", "Cyclonic Rift"), card("a", "Sol Ring", 1, { foil: true })], today, yesterday);
    const u = res.get("u1")!;
    expect(u.alert).toBe(true);
    expect(u.total).toBeCloseTo(6 + 0.5 - 3);
    expect(u.movers.map((x) => x.name)).toEqual(["Sol Ring", "Cyclonic Rift", "Opt"]);
    expect(Math.round(u.movers[0].percent)).toBe(33);
    const msg = messages.priceMoves(u.total, u.movers);
    expect(msg.title).toBe("Deine Sammlung: +3,50 € seit gestern");
    expect(msg.body).toBe("Sol Ring +6,00 € (+33 %) · Cyclonic Rift −3,00 € (−38 %) · Opt +0,50 € (+50 %)");
  });

  it("Zustand zählt mit, Karten ohne Vortagespreis nicht", () => {
    const res = priceMovers([card("a", "Sol Ring", 1, { condition: "HP" }), card("x", "Neu")], today, yesterday);
    expect(res.get("u1")!.total).toBeCloseTo(1.8);
    expect(res.get("u1")!.alert).toBe(false);
  });

  it("viele kleine Bewegungen: ab 5 € für die ganze Sammlung", () => {
    const t: DayPrices = new Map([["s", { eur: 10.5, eurFoil: null }]]);
    const y: DayPrices = new Map([["s", { eur: 10, eurFoil: null }]]);
    expect(priceMovers([card("s", "Selenia", 9)], t, y).get("u1")!.alert).toBe(false);
    const u = priceMovers([card("s", "Selenia", 10)], t, y).get("u1")!;
    expect(u.alert).toBe(true);
    expect(u.movers[0].delta).toBeCloseTo(5);
  });
});
