import { describe, expect, it } from "vitest";
import { compactTopPage, rankIndex } from "@/lib/edhrecTop";

describe("EDHREC Top-Commander", () => {
  it("liest erste Seite und Folgeseiten", () => {
    const first = { container: { json_dict: { cardlists: [{ cardviews: [{ name: "Edgar Markov", slug: "edgar-markov", num_decks: 52809, rank: 2 }] }] } } };
    const next = { cardviews: [{ name: "Marneus Calgar", sanitized: "marneus-calgar", num_decks: 18041, rank: 101 }] };
    expect(compactTopPage(first, 0)).toEqual([{ rank: 2, name: "Edgar Markov", slug: "edgar-markov", decks: 52809 }]);
    expect(compactTopPage(next, 1)[0]).toMatchObject({ rank: 101, slug: "marneus-calgar" });
  });
  it("Rang je Name, Partner aus Paaren, eigener Eintrag hat Vorrang", () => {
    const idx = rankIndex([
      { rank: 5, name: "Frodo, Adventurous Hobbit // Sam, Loyal Attendant", slug: "x", decks: 1 },
      { rank: 9, name: "Edgar Markov", slug: "e", decks: 1 },
      { rank: 40, name: "Sam, Loyal Attendant", slug: "s", decks: 1 },
    ]);
    expect(idx.get("edgar markov")?.rank).toBe(9);
    expect(idx.get("frodo, adventurous hobbit")?.rank).toBe(5);
    expect(idx.get("sam, loyal attendant")?.rank).toBe(40);
  });
});
