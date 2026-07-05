import { describe, it, expect } from "vitest";
import { csvToEntries, entriesToCsv, moxfieldCsvToEntries } from "@/lib/csv";

describe("csvToEntries", () => {
  it("liest Moxfield-artige CSV mit Count/Name/Foil", () => {
    const csv = "Count,Name,Foil\n2,Sol Ring,\n1,Cyclonic Rift,foil";
    const res = csvToEntries(csv);
    expect(res).toEqual([
      { name: "Sol Ring", quantity: 2, foil: false },
      { name: "Cyclonic Rift", quantity: 1, foil: true },
    ]);
  });

  it("kommt mit Semikolon-Trennung zurecht", () => {
    const csv = "Name;Quantity\nBrainstorm;3";
    expect(csvToEntries(csv)[0]).toEqual({
      name: "Brainstorm",
      quantity: 3,
      foil: false,
    });
  });

  it("behandelt Anführungszeichen und Kommas im Namen", () => {
    const csv = 'Name,Count\n"Borrowing 100,000 Arrows",1';
    const res = csvToEntries(csv);
    expect(res[0].name).toBe("Borrowing 100,000 Arrows");
    expect(res[0].quantity).toBe(1);
  });

  it("behandelt Dateien ohne erkennbaren Header als reine Namensliste", () => {
    const csv = "Sol Ring\nBrainstorm";
    const res = csvToEntries(csv);
    expect(res.map((e) => e.name)).toEqual(["Sol Ring", "Brainstorm"]);
  });

  it("ist ein Roundtrip-Partner zu entriesToCsv", () => {
    const cards = [
      { name: "Sol Ring", quantity: 2, foil: false, set_code: "c21", price_eur: 1.8, price_eur_foil: null },
    ];
    const csv = entriesToCsv(cards);
    const back = csvToEntries(csv);
    expect(back[0]).toEqual({ name: "Sol Ring", quantity: 2, foil: false });
  });
});

describe("moxfieldCsvToEntries mit ManaBox-Export", () => {
  const csv =
    "Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,ManaBox ID,Scryfall ID,Purchase price,Misprint,Altered,Condition,Language,Purchase price currency,Added\n" +
    "Sagu Pummeler,TDM,Tarkir: Dragonstorm,156,normal,common,2,105169,def9cb5b-4062-481e-b682-3a30443c2e56,0.08,false,false,near_mint,de,EUR,2026-07-04T18:54:58.416Z\n" +
    "Mountain,EOE,Edge of Eternities,273,foil,common,1,107028,5cd39b01-9a06-4575-9c63-9fb3ba9ef101,0.11,false,false,near_mint,de,EUR,2026-07-05T07:59:28.827Z\n" +
    '"Windurst, Federation Center",FIN,Final Fantasy,292,normal,common,1,106649,c74024bd-b383-468d-9cf5-d112a29f6457,0.17,false,false,near_mint,de,EUR,2026-07-05T07:59:28.804Z';

  it("erkennt die Scryfall-ID-Spalte und parst Menge/Foil korrekt", () => {
    const res = moxfieldCsvToEntries(csv);
    expect(res).not.toBeNull();
    expect(res).toEqual([
      {
        scryfallId: "def9cb5b-4062-481e-b682-3a30443c2e56",
        name: "Sagu Pummeler",
        quantity: 2,
        foil: false,
      },
      {
        scryfallId: "5cd39b01-9a06-4575-9c63-9fb3ba9ef101",
        name: "Mountain",
        quantity: 1,
        foil: true,
      },
      {
        scryfallId: "c74024bd-b383-468d-9cf5-d112a29f6457",
        name: "Windurst, Federation Center",
        quantity: 1,
        foil: false,
      },
    ]);
  });
});
