import { describe, expect, it } from "vitest";
import { GermanNames, germanName, isPaper, parseLine, textLines, toCatalogRow, type ScryCard } from "@/lib/catalog";

const bolt: ScryCard = {
  id: "11111111-1111-1111-1111-111111111111", oracle_id: "o1", name: "Lightning Bolt", lang: "en", set: "m10", set_name: "Magic 2010",
  collector_number: "146", rarity: "common", layout: "normal", type_line: "Instant", mana_cost: "{R}", cmc: 1, colors: ["R"], color_identity: ["R"],
  oracle_text: "Lightning Bolt deals 3 damage to any target.", image_uris: { normal: "https://img/bolt.jpg" }, prices: { eur: "1.239", eur_foil: null },
  released_at: "2009-07-17", cardmarket_id: 20219, games: ["paper", "mtgo"], finishes: ["nonfoil", "foil"],
};
const dfc: ScryCard = {
  id: "2", oracle_id: "o2", name: "Delver of Secrets // Insectile Aberration", set: "isd", collector_number: "51", layout: "transform",
  card_faces: [
    { name: "Delver of Secrets", mana_cost: "{U}", type_line: "Creature — Human Wizard", oracle_text: "Transform …", colors: ["U"], image_uris: { normal: "https://img/delver.jpg" }, power: "1", toughness: "1" },
    { name: "Insectile Aberration", oracle_text: "Flying" },
  ],
};

describe("Katalog", () => {
  it("bildet eine Karte ab (Preis gerundet)", () => {
    const r = toCatalogRow(bolt, "2026-11-19T00:00:00Z");
    expect(r).toMatchObject({ name: "Lightning Bolt", set: "m10", collector_number: "146", eur: 1.24, eur_foil: null, image_url: "https://img/bolt.jpg", cardmarket_id: 20219 });
  });
  it("doppelseitige Karten: Daten der Vorderseite, Text beider Seiten", () => {
    const r = toCatalogRow(dfc, "x");
    expect(r.mana_cost).toBe("{U}");
    expect(r.image_url).toBe("https://img/delver.jpg");
    expect(r.oracle_text).toBe("Delver of Secrets\nTransform …\n\nInsectile Aberration\nFlying");
    expect(r.power).toBe("1");
  });
  it("nur Papierkarten", () => {
    expect(isPaper(bolt)).toBe(true);
    expect(isPaper({ ...bolt, games: ["arena"] })).toBe(false);
  });
  it("liest Zeilen (JSONL und altes Array-Format)", async () => {
    expect(parseLine(JSON.stringify(bolt))?.name).toBe("Lightning Bolt");
    expect(parseLine(`${JSON.stringify(bolt)},`)?.id).toBe(bolt.id);
    expect(parseLine("[")).toBeNull();
    const stream = new ReadableStream<string>({
      start(c) {
        c.enqueue('{"a":1}\n{"b"');
        c.enqueue(':2}\n\n{"c":3}');
        c.close();
      },
    });
    const out: string[] = [];
    for await (const l of textLines(stream)) out.push(l);
    expect(out).toEqual(['{"a":1}', '{"b":2}', '{"c":3}']);
  });
  it("deutsche Namen: häufigster gedruckter Name je Karte", () => {
    const de = (printed: string): ScryCard => ({ ...bolt, id: printed, lang: "de", printed_name: printed });
    expect(germanName(de("Blitzschlag"))).toBe("Blitzschlag");
    expect(germanName({ ...bolt, lang: "en", printed_name: "x" })).toBeNull();
    const g = new GermanNames();
    [de("Blitzschlag"), de("Blitzschlag"), de("Blitz")].forEach((c) => g.add(c));
    expect(g.result()).toEqual([{ oracle_id: "o1", name_de: "Blitzschlag" }]);
  });
});

import { gzipSync } from "node:zlib";
import { streamLines } from "@/lib/catalog";

describe("gepackte Gesamtdatei", () => {
  it("liest gzip-JSONL zeilenweise", async () => {
    const buf = gzipSync(Buffer.from('{"id":"a"}\n{"id":"b"}\n'));
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array(buf.subarray(0, 10)));
        c.enqueue(new Uint8Array(buf.subarray(10)));
        c.close();
      },
    });
    const out: string[] = [];
    for await (const l of streamLines(body, true)) out.push(l);
    expect(out).toEqual(['{"id":"a"}', '{"id":"b"}']);
  });
});
