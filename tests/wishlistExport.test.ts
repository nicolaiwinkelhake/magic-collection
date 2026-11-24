import { describe, expect, it } from "vitest";
import { selectForExport, wishlistToCsv, wishlistToText } from "@/lib/wishlistExport";

const items = [
  { name: "Sol Ring", price_eur: 1.5, folder_ids: ["buff"] },
  { name: "Cultivate", price_eur: 0.45, folder_ids: ["buff", "elfen"] },
  { name: "Rhystic Study", price_eur: 30, folder_ids: [] },
  { name: "Harrow", price_eur: 0.3, folder_ids: ["elfen"] },
];

describe("Wunschliste exportieren", () => {
  it("nimmt gewählte Ordner, optional ohne Ordner, und schließt angefragte Karten aus", () => {
    const pick = (f: string[], unsorted: boolean, ex: string[] = []) =>
      selectForExport(items, { folderIds: new Set(f), unsorted, exclude: new Set(ex) }).map((i) => i.name);
    expect(pick(["buff"], false)).toEqual(["Sol Ring", "Cultivate"]);
    expect(pick(["buff", "elfen"], true)).toEqual(["Sol Ring", "Cultivate", "Rhystic Study", "Harrow"]);
    expect(pick(["buff", "elfen"], true, ["Cultivate"])).toEqual(["Sol Ring", "Rhystic Study", "Harrow"]);
    expect(pick([], true)).toEqual(["Rhystic Study"]);
  });

  it("Text: „1 Name“ alphabetisch, gleiche Namen zusammengefasst", () => {
    expect(wishlistToText([...items, { name: "Sol Ring", price_eur: 2 }])).toBe("1 Cultivate\n1 Harrow\n1 Rhystic Study\n2 Sol Ring");
  });

  it("CSV mit Preis und Ordnernamen", () => {
    const csv = wishlistToCsv([items[1], { name: 'Say "Hi", Bob', price_eur: null, folder_ids: [] }], (id) => ({ buff: "buff", elfen: "Elfen" })[id]);
    expect(csv).toBe('Name,Quantity,Price EUR,Folder\nCultivate,1,0.45,"buff; Elfen"\n"Say ""Hi"", Bob",1,,\n');
  });
});
