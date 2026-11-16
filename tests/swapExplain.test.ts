import { describe, expect, it } from "vitest";
import { explainIn, explainOut } from "@/lib/swapExplain";
import type { DeckHealth, SwapIn, SwapOut } from "@/lib/deckDoctor";

const health = {
  cards: 99, lands: 36, avgCmc: 3.2, curve: [], score: 70, notes: [], unknownRoles: 0,
  checks: [
    { key: "lands", label: "Länder", have: 36, target: 37, min: 35, ok: true },
    { key: "wipe", label: "Board Wipe", have: 0, target: 3, min: 2, ok: false },
    { key: "removal", label: "Removal", have: 9, target: 8, min: 6, ok: true },
  ],
} as DeckHealth;
const add: SwapIn = { name: "Crux of Fate", value: 1, source: "buy", eur: 1.03, image: null, inclusion: 0.71, synergy: 0.63, roles: ["wipe", "removal"], reason: "", score: 1, typeLine: "Sorcery", cmc: 5, list: "highsynergycards", themes: [] };
const out: SwapOut = { name: "Doubling Season", inclusion: null, synergy: null, roles: [], cmc: 5, reason: "", weakness: 0.1, image: null, typeLine: "Enchantment", rolesKnown: true, themes: [] };

describe("Tausch-Begründung", () => {
  it("erklärt, warum die neue Karte rein soll", () => {
    const why = explainIn(add, out, health, { commander: "The Ur-Dragon", numDecks: 51837 });
    expect(why[0]).toMatch(/71 % der 51\.837 The Ur-Dragon-Decks.*Doubling Season taucht dort kaum auf/);
    expect(why.join(" ")).toMatch(/Synergie \+63 %/);
    expect(why.join(" ")).toMatch(/Lücke.*Board Wipe \(0 von 3\)/);
    expect(why.join(" ")).toMatch(/1,03 €/);
    expect(why.join(" ")).toMatch(/„High Synergy“/);
  });
  it("nennt Quelle Sammlung / Freund", () => {
    expect(explainIn({ ...add, source: "collection" }, out, health, { commander: "X" }).at(-1)).toMatch(/Sammlung/);
    const f = { ownerId: "u", ownerName: "max", card: {} as never };
    expect(explainIn({ ...add, source: "friend", friend: f }, out, health, { commander: "X" }).at(-1)).toMatch(/max hat sie/);
  });
  it("erklärt, warum die alte Karte raus kann", () => {
    const why = explainOut({ ...out, cmc: 7 }, { commander: "X", themes: ["Dragons", "Flying"] }).join(" ");
    expect(why).toMatch(/nicht auf/);
    expect(why).toMatch(/keine der Grundrollen/);
    expect(why).toMatch(/Kein Bezug zu den typischen Themen von X \(Dragons, Flying\)/);
    expect(why).toMatch(/7 Mana/);
    expect(explainOut({ ...out, rolesKnown: false }, { commander: "X" }).join(" ")).toMatch(/noch nicht ermittelt/);
    expect(explainOut({ ...out, roles: ["removal"] }, { commander: "X" }).join(" ")).toMatch(/Rolle: Removal/);
  });
});

describe("Begründung mit Zusammenspiel", () => {
  it("nennt Partner im Deck für Rein und Raus", () => {
    const pIn = { known: true, partners: [{ name: "Miirym", lift: 9.6 }, { name: "Old Gnawbone", lift: 4 }] };
    const pOut = { known: true, partners: [] };
    const why = explainIn(add, out, health, { commander: "X", pairsIn: pIn, pairsOut: pOut }).join(" ");
    expect(why).toMatch(/zusammen mit 2 deiner Karten \(Miirym, Old Gnawbone\) – Doubling Season nur mit 0/);
    expect(explainOut(out, { commander: "X", pairsOut: pOut }).join(" ")).toMatch(/mit keiner deiner Karten/);
    expect(explainOut(out, { commander: "X", pairsOut: { known: false, partners: [] } }).join(" ")).toMatch(/keine Daten/);
  });
});
