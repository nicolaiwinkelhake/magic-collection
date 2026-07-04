import { describe, it, expect } from "vitest";
import {
  buildSuggestionQuery,
  buildSuggestionUrl,
  colorIdentityToken,
} from "@/lib/scryfallSearch";

describe("colorIdentityToken", () => {
  it("normalisiert Farben in WUBRG-Reihenfolge und Kleinbuchstaben", () => {
    expect(colorIdentityToken(["B", "W", "U"])).toBe("wub");
    expect(colorIdentityToken(["G", "R"])).toBe("rg");
  });

  it("gibt für farblose Identität 'c' zurück", () => {
    expect(colorIdentityToken([])).toBe("c");
  });
});

describe("buildSuggestionQuery", () => {
  it("baut eine Query mit Oracle-Tag, Farbidentität und Commander-Legalität", () => {
    const q = buildSuggestionQuery("removal", ["W", "U", "B"]);
    expect(q).toContain("otag:removal");
    expect(q).toContain("id<=wub");
    expect(q).toContain("legal:commander");
  });

  it("nutzt für Draw den card-advantage-Tag", () => {
    expect(buildSuggestionQuery("draw", ["U"])).toContain("otag:card-advantage");
  });
});

describe("buildSuggestionUrl", () => {
  it("erzeugt eine gültige Scryfall-Such-URL mit edhrec-Sortierung", () => {
    const url = buildSuggestionUrl("ramp", ["G"]);
    expect(url.startsWith("https://api.scryfall.com/cards/search?")).toBe(true);
    expect(url).toContain("order=edhrec");
    expect(decodeURIComponent(url)).toContain("otag:ramp");
    expect(decodeURIComponent(url)).toContain("id<=g");
  });
});
