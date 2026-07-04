import { describe, it, expect } from "vitest";
import {
  applyTrade,
  tradeBalance,
  TradeError,
  type OwnedCard,
  type Trade,
} from "@/lib/tradeLogic";

const A = "user-a"; // proposer
const B = "user-b"; // partner

function trade(items: Trade["items"], over: Partial<Trade> = {}): Trade {
  return { proposerId: A, partnerId: B, status: "pending", items, ...over };
}

describe("applyTrade – Berechtigung & Status", () => {
  it("nur der Partner darf annehmen", () => {
    const t = trade([]);
    expect(() => applyTrade([], t, A)).toThrow(TradeError);
  });

  it("nicht offene Trades können nicht angenommen werden", () => {
    const t = trade([], { status: "accepted" });
    expect(() => applyTrade([], t, B)).toThrow(/nicht mehr offen/);
  });
});

describe("applyTrade – Bestandsprüfung", () => {
  it("scheitert, wenn der Geber nicht genug besitzt", () => {
    const cards: OwnedCard[] = [
      { userId: A, scryfallId: "sol", foil: false, quantity: 0 },
    ];
    const t = trade([
      { fromUserId: A, scryfallId: "sol", foil: false, quantity: 1, name: "Sol Ring" },
    ]);
    expect(() => applyTrade(cards, t, B)).toThrow(/Sol Ring/);
  });

  it("prüft beide Seiten – auch der Partner muss liefern können", () => {
    const cards: OwnedCard[] = [
      { userId: A, scryfallId: "sol", foil: false, quantity: 1 },
      // B besitzt Cyclonic Rift NICHT
    ];
    const t = trade([
      { fromUserId: A, scryfallId: "sol", foil: false, quantity: 1, name: "Sol Ring" },
      { fromUserId: B, scryfallId: "rift", foil: false, quantity: 1, name: "Cyclonic Rift" },
    ]);
    expect(() => applyTrade(cards, t, B)).toThrow(/Cyclonic Rift/);
  });
});

describe("applyTrade – Transfer", () => {
  it("verschiebt eine Karte vom Geber zum Empfänger", () => {
    const cards: OwnedCard[] = [
      { userId: A, scryfallId: "sol", foil: false, quantity: 1 },
    ];
    const t = trade([
      { fromUserId: A, scryfallId: "sol", foil: false, quantity: 1, name: "Sol Ring" },
    ]);
    const result = applyTrade(cards, t, B);
    // A hat sie nicht mehr, B hat sie
    expect(result.find((c) => c.userId === A)).toBeUndefined();
    expect(result.find((c) => c.userId === B && c.scryfallId === "sol")?.quantity).toBe(1);
  });

  it("führt Mengen beim Empfänger zusammen statt zu duplizieren", () => {
    const cards: OwnedCard[] = [
      { userId: A, scryfallId: "sol", foil: false, quantity: 1 },
      { userId: B, scryfallId: "sol", foil: false, quantity: 2 },
    ];
    const t = trade([
      { fromUserId: A, scryfallId: "sol", foil: false, quantity: 1, name: "Sol Ring" },
    ]);
    const result = applyTrade(cards, t, B);
    const bRows = result.filter((c) => c.userId === B && c.scryfallId === "sol");
    expect(bRows).toHaveLength(1);
    expect(bRows[0].quantity).toBe(3);
  });

  it("erhält Teilmengen (Geber behält den Rest)", () => {
    const cards: OwnedCard[] = [
      { userId: A, scryfallId: "bolt", foil: false, quantity: 3 },
    ];
    const t = trade([
      { fromUserId: A, scryfallId: "bolt", foil: false, quantity: 1, name: "Lightning Bolt" },
    ]);
    const result = applyTrade(cards, t, B);
    expect(result.find((c) => c.userId === A)?.quantity).toBe(2);
    expect(result.find((c) => c.userId === B)?.quantity).toBe(1);
  });

  it("behandelt Foil und Normal als getrennte Bestände", () => {
    const cards: OwnedCard[] = [
      { userId: A, scryfallId: "sol", foil: true, quantity: 1 },
      { userId: A, scryfallId: "sol", foil: false, quantity: 1 },
    ];
    const t = trade([
      { fromUserId: A, scryfallId: "sol", foil: true, quantity: 1, name: "Sol Ring (Foil)" },
    ]);
    const result = applyTrade(cards, t, B);
    // Nur das Foil wandert
    expect(result.find((c) => c.userId === B && c.foil)?.quantity).toBe(1);
    expect(result.find((c) => c.userId === A && !c.foil)?.quantity).toBe(1);
    expect(result.find((c) => c.userId === A && c.foil)).toBeUndefined();
  });

  it("wickelt einen beidseitigen Tausch vollständig ab", () => {
    const cards: OwnedCard[] = [
      { userId: A, scryfallId: "tutor", foil: false, quantity: 1 },
      { userId: B, scryfallId: "rift", foil: false, quantity: 1 },
    ];
    const t = trade([
      { fromUserId: A, scryfallId: "tutor", foil: false, quantity: 1, name: "Demonic Tutor" },
      { fromUserId: B, scryfallId: "rift", foil: false, quantity: 1, name: "Cyclonic Rift" },
    ]);
    const result = applyTrade(cards, t, B);
    expect(result.find((c) => c.userId === B && c.scryfallId === "tutor")?.quantity).toBe(1);
    expect(result.find((c) => c.userId === A && c.scryfallId === "rift")?.quantity).toBe(1);
    expect(result.find((c) => c.userId === A && c.scryfallId === "tutor")).toBeUndefined();
    expect(result.find((c) => c.userId === B && c.scryfallId === "rift")).toBeUndefined();
  });

  it("verändert den Ausgangsbestand nicht (keine Seiteneffekte)", () => {
    const cards: OwnedCard[] = [
      { userId: A, scryfallId: "sol", foil: false, quantity: 1 },
    ];
    const t = trade([
      { fromUserId: A, scryfallId: "sol", foil: false, quantity: 1, name: "Sol Ring" },
    ]);
    applyTrade(cards, t, B);
    expect(cards[0].quantity).toBe(1); // Original unverändert
  });
});

describe("tradeBalance", () => {
  it("berechnet den Vorteil aus Sicht des Nutzers", () => {
    const items = [
      { fromUserId: A, quantity: 1, price: 28.9 }, // A gibt
      { fromUserId: B, quantity: 1, price: 19.5 }, // A bekommt
    ];
    // Aus Sicht von A: bekommt 19,50 − gibt 28,90 = −9,40
    expect(tradeBalance(items, A)).toBe(-9.4);
    // Aus Sicht von B spiegelverkehrt
    expect(tradeBalance(items, B)).toBe(9.4);
  });

  it("behandelt fehlende Preise als 0", () => {
    const items = [{ fromUserId: A, quantity: 2, price: null }];
    expect(tradeBalance(items, B)).toBe(0);
  });
});
