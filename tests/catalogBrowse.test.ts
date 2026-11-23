import { describe, expect, it } from "vitest";
import { browseParams, rowToCard, withPrint, type CatalogRow } from "@/lib/catalogBrowse";
import { DEFAULT_FILTERS } from "@/lib/cardFilters";

const row: CatalogRow = {
  id: "p1", oracle_id: "o1", name: "Lightning Bolt", name_de: "Blitzschlag", type_line: "Instant", oracle_text: "Lightning Bolt deals 3 damage to any target.",
  mana_cost: "{R}", cmc: 1, colors: ["R"], rarity: "common", set: "m11", set_name: "Magic 2011", collector_number: "149", image_url: "a.jpg",
  eur: "1.50", eur_foil: null, edhrec_rank: 2, total: "1234",
};

describe("Katalog-Seite", () => {
  it("übersetzt die Filter für die Datenbank", () => {
    expect(browseParams({ ...DEFAULT_FILTERS, search: "  draw a card ", inText: true, colors: ["U"], rarity: "rare", type: " Creature ", set: "mkm", sort: "price" }, 60)).toEqual({
      p_search: "draw a card", p_in_text: true, p_colors: ["U"], p_rarity: "rare", p_type: "Creature", p_set: "mkm", p_sort: "price", p_limit: 60, p_offset: 60,
    });
    expect(browseParams(DEFAULT_FILTERS, 0).p_in_text).toBe(false);
  });
  it("macht aus einer Katalogzeile eine Karte wie in der Sammlung", () => {
    expect(rowToCard(row)).toMatchObject({ id: "p1", scryfall_id: "p1", name: "Lightning Bolt", name_de: "Blitzschlag", set_code: "m11", price_eur: 1.5, price_eur_foil: null, quantity: 1, foil: false, colors: ["R"] });
  });
  it("Version wechseln: nur Druck, Bild und Preis ändern sich", () => {
    const card = rowToCard(row);
    const other = withPrint(card, { id: "p2", name: "Lightning Bolt", imageUrl: "b.jpg", eur: 0.4, eurFoil: 2, set: "clb", collectorNumber: "187" });
    expect(other).toMatchObject({ id: "p1", scryfall_id: "p2", set_code: "clb", collector_number: "187", image_url: "b.jpg", price_eur: 0.4, price_eur_foil: 2 });
    expect(other.oracle_text).toBe(card.oracle_text);
    expect(other.name_de).toBe("Blitzschlag");
  });
});
