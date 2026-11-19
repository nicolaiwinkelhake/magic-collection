import { describe, expect, it } from "vitest";
import { catalogToScryfall, catalogByNames, type CatalogCardRow } from "@/lib/catalogLookup";
import { pickDefaultPrint } from "@/lib/catalogPick";
import { getPrices } from "@/lib/scryfall";

const row: CatalogCardRow = {
  id: "a", oracle_id: "o", name: "Command Tower", name_de: "Befehlsturm", set: "cmm", set_name: "Commander Masters", collector_number: "1007",
  rarity: "common", layout: "normal", type_line: "Land", mana_cost: null, cmc: 0, colors: [], color_identity: [], produced_mana: ["W", "U", "B", "R", "G"],
  oracle_text: "{T}: Add one mana …", image_url: "https://img/ct.jpg", eur: "0.25", eur_foil: null, released_at: "2023-08-04", edhrec_rank: 1, game_changer: false,
  promo: false, set_type: "masters", frame_effects: null, border_color: "black", full_art: false, variation: false, oversized: false, textless: false, lang: "en",
};

describe("Katalog nachschlagen", () => {
  it("liefert Scryfall-Format inkl. erzeugtem Mana und Preisen", () => {
    const c = catalogToScryfall(row);
    expect(c.produced_mana).toEqual(["W", "U", "B", "R", "G"]);
    expect(getPrices(c)).toEqual({ eur: 0.25, eurFoil: null });
    expect(c.image_uris?.normal).toBe("https://img/ct.jpg");
    expect(c.edhrec_rank).toBe(1);
  });
  it("ohne Datenbank: nichts gefunden (Aufrufer fragt Scryfall)", async () => {
    expect((await catalogByNames(["Sol Ring"])).size).toBe(0);
  });
  it("Ersatz-Standarddruck: normaler, neuester Druck vor Promo/Showcase", () => {
    const base = { collector_number: "1", border_color: "black" };
    const pick = pickDefaultPrint([
      { ...base, released_at: "2025-01-01", promo: true },
      { ...base, released_at: "2024-06-01", frame_effects: ["showcase"] },
      { ...base, released_at: "2023-01-01" },
      { ...base, released_at: "2024-01-01", collector_number: "5" },
    ]);
    expect(pick?.released_at).toBe("2024-01-01");
  });
});
