import { describe, expect, it } from "vitest";
import { groupByType, typeGroupOf } from "@/lib/deckTypeGroups";

const c = (type_line: string | null, is_commander = false) => ({ type_line, is_commander });

describe("typeGroupOf", () => {
  it("ordnet Grundtypen zu", () => {
    expect(typeGroupOf(c("Legendary Creature — Elf"))).toBe("creature");
    expect(typeGroupOf(c("Instant"))).toBe("instant");
    expect(typeGroupOf(c("Basic Land — Forest"))).toBe("land");
    expect(typeGroupOf(c("Legendary Planeswalker — Jace"))).toBe("planeswalker");
    expect(typeGroupOf(c(null))).toBe("other");
  });
  it("Commander geht vor", () => {
    expect(typeGroupOf(c("Legendary Creature — Phyrexian Angel", true))).toBe("commander");
  });
  it("Kreatur schlägt Land, Land schlägt Artefakt", () => {
    expect(typeGroupOf(c("Land Creature — Forest Dryad"))).toBe("creature");
    expect(typeGroupOf(c("Artifact Land"))).toBe("land");
    expect(typeGroupOf(c("Artifact Creature — Golem"))).toBe("creature");
  });
  it("nutzt bei doppelseitigen Karten die Vorderseite", () => {
    expect(typeGroupOf(c("Sorcery // Land"))).toBe("sorcery");
  });
});

describe("groupByType", () => {
  it("sortiert Gruppen fest und zählt Kopien", () => {
    const groups = groupByType([[c("Basic Land — Island"), c("Basic Land — Island")], [c("Instant")], [c("Creature — Elf", true)]]);
    expect(groups.map((g) => g.key)).toEqual(["commander", "instant", "land"]);
    expect(groups[2].count).toBe(2);
  });
});
