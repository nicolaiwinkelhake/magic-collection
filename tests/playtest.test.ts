import { describe, it, expect } from "vitest";
import {
  makeRng,
  buildLibrary,
  shuffle,
  newGame,
  mulligan,
  draw,
  countLands,
  type PlaytestCard,
} from "@/lib/playtest";

function card(p: Partial<PlaytestCard>): PlaytestCard {
  return {
    id: p.id ?? Math.random().toString(),
    name: p.name ?? "Card",
    image_url: p.image_url ?? null,
    type_line: p.type_line ?? "Creature",
    is_commander: p.is_commander ?? false,
  };
}

function deck(n: number): PlaytestCard[] {
  return Array.from({ length: n }, (_, i) =>
    card({ id: String(i), name: `Card ${i}`, type_line: i < 37 ? "Land" : "Creature" })
  );
}

describe("buildLibrary", () => {
  it("schließt den Commander aus", () => {
    const cards = [card({ is_commander: true }), card({}), card({})];
    expect(buildLibrary(cards)).toHaveLength(2);
  });
});

describe("shuffle", () => {
  it("behält alle Elemente (Permutation)", () => {
    const input = deck(20);
    const out = shuffle(input, makeRng(42));
    expect(out).toHaveLength(20);
    expect(new Set(out.map((c) => c.id))).toEqual(new Set(input.map((c) => c.id)));
  });

  it("ist mit gleichem Seed reproduzierbar", () => {
    const input = deck(20);
    const a = shuffle(input, makeRng(7)).map((c) => c.id);
    const b = shuffle(input, makeRng(7)).map((c) => c.id);
    expect(a).toEqual(b);
  });

  it("verändert das Original nicht", () => {
    const input = deck(10);
    const ids = input.map((c) => c.id);
    shuffle(input, makeRng(1));
    expect(input.map((c) => c.id)).toEqual(ids);
  });
});

describe("newGame", () => {
  it("zieht 7 Karten und lässt den Rest in der Bibliothek", () => {
    const g = newGame(deck(100), makeRng(3));
    expect(g.hand).toHaveLength(7);
    expect(g.library).toHaveLength(99 - 7); // 100 − Commander? hier kein Commander → 100−7
  });

  it("Hand + Bibliothek = Bibliotheksgröße", () => {
    const g = newGame(deck(60), makeRng(3));
    expect(g.hand.length + g.library.length).toBe(60);
  });
});

describe("mulligan", () => {
  it("erhöht den Mulligan-Zähler und zieht neu", () => {
    const cards = deck(100);
    const g0 = newGame(cards, makeRng(1));
    const g1 = mulligan(cards, g0, makeRng(2));
    expect(g1.mulligans).toBe(1);
    expect(g1.hand).toHaveLength(7);
  });
});

describe("draw", () => {
  it("zieht die oberste Karte", () => {
    const g = newGame(deck(60), makeRng(5));
    const before = g.library[0];
    const { state, card: drawn } = draw(g);
    expect(drawn?.id).toBe(before.id);
    expect(state.hand).toHaveLength(8);
    expect(state.library).toHaveLength(g.library.length - 1);
  });

  it("gibt null zurück, wenn die Bibliothek leer ist", () => {
    const empty = { library: [], hand: [], mulligans: 0 };
    expect(draw(empty).card).toBeNull();
  });
});

describe("countLands", () => {
  it("zählt Länder in einer Hand", () => {
    const hand = [
      card({ type_line: "Basic Land — Forest" }),
      card({ type_line: "Creature" }),
      card({ type_line: "Land" }),
    ];
    expect(countLands(hand)).toBe(2);
  });
});
