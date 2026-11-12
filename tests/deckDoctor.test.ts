import { describe, expect, it } from "vitest";
import { deckHealth, planSwaps, type Availability, type CandidateInfo, type DoctorDeckCard } from "@/lib/deckDoctor";
import type { CardRole } from "@/lib/cardRoles";

const land = (i: number): DoctorDeckCard => ({ name: `Land ${i}`, type_line: "Basic Land — Forest", cmc: 0, is_commander: false });
const spell = (name: string, cmc = 3): DoctorDeckCard => ({ name, type_line: "Creature — Elf", cmc, is_commander: false });

function deckOf(lands: number, spells: DoctorDeckCard[]): DoctorDeckCard[] {
  return [{ name: "Cmdr", type_line: "Legendary Creature", cmc: 4, is_commander: true }, ...Array.from({ length: lands }, (_, i) => land(i)), ...spells];
}

describe("deckHealth", () => {
  it("bewertet ein ausgewogenes Deck hoch, ein dünnes niedrig", () => {
    const roles = new Map<string, CardRole[]>();
    const good: DoctorDeckCard[] = [];
    const add = (prefix: string, n: number, role: CardRole, cmc = 2) => {
      for (let i = 0; i < n; i++) {
        good.push(spell(`${prefix}${i}`, cmc));
        roles.set(`${prefix}${i}`, [role]);
      }
    };
    add("R", 10, "ramp");
    add("D", 10, "draw");
    add("X", 8, "removal");
    add("W", 3, "wipe", 4);
    for (let i = 0; i < 31; i++) {
      good.push(spell(`S${i}`, 3));
      roles.set(`S${i}`, []);
    }
    const h = deckHealth(deckOf(37, good), roles);
    expect(h.cards).toBe(99);
    expect(h.score).toBeGreaterThanOrEqual(95);
    expect(h.notes).toEqual([]);

    const thin = deckHealth(deckOf(41, [spell("A", 7), spell("B", 6)]), new Map([["A", []], ["B", ["ramp" as CardRole]]]));
    expect(thin.score).toBeLessThan(40);
    expect(thin.notes[0]).toMatch(/41 Länder/);
    expect(thin.notes.some((n) => /Ramp: 1 von 10/.test(n))).toBe(true);
    expect(thin.curve[6] + thin.curve[7]).toBe(2);
  });
});

describe("planSwaps", () => {
  it("tauscht schwache Karten gegen passende, bevorzugt freie eigene Karten", () => {
    const deck = deckOf(37, [spell("Altkarte", 6), spell("Stütze", 2), spell("Füller", 3)]);
    const roles = new Map<string, CardRole[]>([
      ["Altkarte", []],
      ["Füller", []],
      ["Stütze", ["ramp"]],
      ["Signet", ["ramp"]],
      ["Devil", []],
      ["Teuer", ["draw"]],
    ]);
    const health = deckHealth(deck, roles);
    const info = new Map<string, CandidateInfo>([
      ["Signet", { typeLine: "Artifact", cmc: 2, eur: 1, image: null, identity: [] }],
      ["Devil", { typeLine: "Creature", cmc: 3, eur: 2, image: null, identity: ["B", "R"] }],
      ["Teuer", { typeLine: "Enchantment", cmc: 3, eur: 40, image: null, identity: ["U"] }],
    ]);
    const availability = new Map<string, Availability>([
      ["Signet", { free: 1, owned: 1, friends: [] }],
      [
        "Devil",
        {
          free: 0,
          owned: 0,
          friends: [{ ownerId: "f", ownerName: "max", card: { id: "c1", name: "Devil", image_url: null, foil: false, quantity: 1, price_eur: 2, price_eur_foil: null, set_code: "war" } }],
        },
      ],
    ]);
    const { swaps, adds } = planSwaps({
      deck,
      identity: ["B", "R", "G"],
      commanderNames: ["Cmdr"],
      edhrec: [
        { name: "Stütze", inclusion: 0.8, synergy: 0.1, lift: 1, list: "x" },
        { name: "Signet", inclusion: 0.6, synergy: 0.05, lift: 1, list: "x" },
        { name: "Devil", inclusion: 0.5, synergy: 0.4, lift: 2, list: "x" },
        { name: "Teuer", inclusion: 0.9, synergy: 0.5, lift: 3, list: "x" }, // falsche Farbe
      ],
      roles,
      info,
      availability,
      health,
    });
    expect(adds.map((a) => a.name)).toEqual(["Signet", "Devil"]);
    expect(swaps[0]).toMatchObject({ out: { name: "Altkarte" }, in: { name: "Signet", source: "collection" } });
    expect(swaps[0].in.reason).toMatch(/Ramp fehlt/);
    expect(swaps[1]?.in).toMatchObject({ name: "Devil", source: "friend" });
    expect(swaps[1]?.in.friend?.ownerName).toBe("max");
    // die starke Karte bleibt
    expect(swaps.some((s) => s.out.name === "Stütze")).toBe(false);
  });
});
