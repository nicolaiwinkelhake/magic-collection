import { describe, it, expect } from "vitest";
import { buildRoleQuery, countRoles, isLand, type CardRole } from "@/lib/cardRoles";
import { sortIdentity, unionIdentity, withinIdentity } from "@/lib/colorIdentity";
import { analyzeDeck } from "@/lib/deckAnalysis";
import { categorizeCard } from "@/lib/deckCategories";

const card = (name: string, type_line = "Artifact", extra: Record<string, unknown> = {}) => ({
  name,
  type_line,
  oracle_text: null,
  cmc: 2,
  colors: [] as string[],
  is_commander: false,
  ...extra,
});

describe("buildRoleQuery", () => {
  it("verknüpft exakte Namen und hängt den Tag an", () => {
    expect(buildRoleQuery(["Sol Ring", "Fire // Ice"], "ramp")).toBe('(!"Sol Ring" or !"Fire // Ice") otag:ramp');
  });
});

describe("isLand", () => {
  it("erkennt Länder, aber keine MDFC mit Zauber-Vorderseite", () => {
    expect(isLand({ type_line: "Land — Forest" })).toBe(true);
    expect(isLand({ type_line: "Instant // Land" })).toBe(false);
    expect(isLand({ type_line: "Land // Land" })).toBe(true);
  });
});

describe("countRoles", () => {
  it("zählt Mehrfachrollen, trennt Länder und unbekannte Karten, ignoriert Commander", () => {
    const roles = new Map<string, CardRole[]>([
      ["Sol Ring", ["ramp"]],
      ["Wrath of God", ["removal", "wipe"]],
    ]);
    const cards = [
      card("Sol Ring"),
      card("Wrath of God", "Sorcery"),
      card("Forest", "Basic Land — Forest"),
      card("Unbekannt", "Creature"),
      card("Meren", "Legendary Creature", { is_commander: true }),
    ];
    const r = countRoles(cards, roles);
    expect(r.byRole.ramp.map((c) => c.name)).toEqual(["Sol Ring"]);
    expect(r.byRole.removal).toHaveLength(1);
    expect(r.byRole.wipe).toHaveLength(1);
    expect(r.lands).toHaveLength(1);
    expect(r.unknown.map((c) => c.name)).toEqual(["Unbekannt"]);
  });
});

describe("colorIdentity", () => {
  it("sortiert in WUBRG und vereinigt Partner", () => {
    expect(sortIdentity(["g", "W", "B", "W"])).toEqual(["W", "B", "G"]);
    expect(unionIdentity([["W", "B"], ["U"]])).toEqual(["W", "U", "B"]);
  });

  it("prüft, ob eine Karte in die Identität passt", () => {
    expect(withinIdentity(["B"], ["B", "G"])).toBe(true);
    expect(withinIdentity(["R"], ["B", "G"])).toBe(false);
    expect(withinIdentity([], ["B"])).toBe(true);
  });
});

describe("analyzeDeck mit Scryfall-Rollen", () => {
  it("nutzt Rollen statt Textmuster und Identität statt Farben", () => {
    const roles = new Map<string, CardRole[]>([["Arcane Signet", ["ramp"]]]);
    const cards = [
      card("Arcane Signet"), // Text würde nicht als Ramp erkannt
      // Karte ohne Farbe, aber mit roter Identität (z. B. Fähigkeitskosten)
      card("Red Hybrid Thing", "Artifact", { color_identity: ["R"] }),
    ];
    const { stats, suggestions } = analyzeDeck(cards, ["B", "G"], roles);
    expect(stats.ramp).toBe(1);
    expect(suggestions.some((s) => s.message.includes("Red Hybrid Thing"))).toBe(true);
  });
});

describe("categorizeCard mit Rollen", () => {
  it("wählt nach Priorität (Wipe vor Removal) und neue Kategorien", () => {
    const roles = new Map<string, CardRole[]>([
      ["Wrath of God", ["removal", "wipe"]],
      ["Demonic Tutor", ["tutor"]],
      ["Grizzly Bears", []],
    ]);
    expect(categorizeCard(card("Wrath of God", "Sorcery"), roles)).toBe("Board Wipe");
    expect(categorizeCard(card("Demonic Tutor", "Sorcery"), roles)).toBe("Tutor");
    expect(categorizeCard(card("Grizzly Bears", "Creature — Bear"), roles)).toBe("Kreaturen");
  });
});
