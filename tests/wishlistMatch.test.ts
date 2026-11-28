import { describe, expect, it } from "vitest";
import { cardKey, wishlistMatches } from "@/lib/wishlistMatch";

describe("wishlistMatches", () => {
  const wish = [
    { id: "1", name: "Sol Ring" },
    { id: "2", name: "Sol Ring" },
    { id: "3", name: "Delver of Secrets // Insectile Aberration" },
    { id: "4", name: "Counterspell" },
  ];
  it("findet alle Versionen derselben Karte, egal welche Schreibweise", () => {
    expect(wishlistMatches(wish, ["sol ring"]).map((w) => w.id)).toEqual(["1", "2"]);
  });
  it("doppelseitige Karten über die Vorderseite", () => {
    expect(wishlistMatches(wish, ["Delver of Secrets"]).map((w) => w.id)).toEqual(["3"]);
    expect(cardKey("Delver of Secrets // Insectile Aberration")).toBe("delver of secrets");
  });
  it("nichts, wenn keine Karte passt", () => {
    expect(wishlistMatches(wish, ["Lightning Bolt"])).toEqual([]);
  });
});
