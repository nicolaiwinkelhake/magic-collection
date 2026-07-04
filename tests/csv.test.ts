import { describe, it, expect } from "vitest";
import { csvToEntries, entriesToCsv } from "@/lib/csv";

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
