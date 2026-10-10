import { describe, it, expect } from "vitest";
import {
  batchFingerprint,
  buildJob,
  chunkItems,
  groupEntries,
  notImportedCsv,
  summarizeJob,
  type SourceEntry,
} from "@/lib/importJob";

const e = (name: string, line: number, extra: Partial<SourceEntry> = {}): SourceEntry => ({
  name,
  quantity: 1,
  foil: false,
  line,
  ...extra,
});

describe("groupEntries", () => {
  it("fasst gleiche Namen (Groß-/Kleinschreibung egal) zusammen und merkt sich die Zeilen", () => {
    const out = groupEntries([e("Lightning Bolt", 1), e("lightning bolt", 4, { quantity: 2 })]);
    expect(out).toHaveLength(1);
    expect(out[0].quantity).toBe(3);
    expect(out[0].lines).toEqual([1, 4]);
  });

  it("trennt Foil und Nicht-Foil", () => {
    expect(groupEntries([e("Bolt", 1), e("Bolt", 2, { foil: true })])).toHaveLength(2);
  });

  it("gruppiert per Scryfall-ID, wenn vorhanden", () => {
    const out = groupEntries([
      e("Bolt", 1, { scryfallId: "ABC" }),
      e("Bolt", 2, { scryfallId: "abc" }),
      e("Bolt", 3, { scryfallId: "def" }),
    ]);
    expect(out.map((x) => x.quantity)).toEqual([2, 1]);
  });
});

describe("chunkItems", () => {
  it("teilt in Pakete und nummeriert je Paket ab 0", () => {
    const items = groupEntries(Array.from({ length: 250 }, (_, i) => e(`Card ${i}`, i + 1)));
    const chunks = chunkItems(items, 100);
    expect(chunks.map((c) => c.length)).toEqual([100, 100, 50]);
    expect(chunks[1][0].i).toBe(0);
    expect(chunks[1][99].i).toBe(99);
  });
});

describe("batchFingerprint / buildJob", () => {
  it("gleicher Inhalt → gleicher Schlüssel, unabhängig von Zeilennummern", async () => {
    const a = await buildJob([e("Bolt", 1), e("Opt", 2)], { source: "a.csv", mode: "text", allowDuplicates: false });
    const b = await buildJob([e("Bolt", 10), e("Opt", 20)], { source: "b.csv", mode: "text", allowDuplicates: false });
    expect(a.batches[0].key).toBe(b.batches[0].key);
  });

  it("andere Menge oder Duplikat-Option → anderer Schlüssel", () => {
    const [items] = chunkItems(groupEntries([e("Bolt", 1)]));
    const [more] = chunkItems(groupEntries([e("Bolt", 1, { quantity: 2 })]));
    expect(batchFingerprint(items, false)).not.toBe(batchFingerprint(more, false));
    expect(batchFingerprint(items, false)).not.toBe(batchFingerprint(items, true));
  });

  it("dieselbe Datei erzeugt dieselben Paket-Schlüssel (Schutz vor Dubletten)", async () => {
    const entries = Array.from({ length: 230 }, (_, i) => e(`Card ${i}`, i + 1));
    const opts = { source: "x.csv", mode: "text" as const, allowDuplicates: true };
    const a = await buildJob(entries, opts);
    const b = await buildJob(entries, opts);
    expect(a.batches.map((x) => x.key)).toEqual(b.batches.map((x) => x.key));
    expect(new Set(a.batches.map((x) => x.key)).size).toBe(3);
  });
});

describe("summarizeJob / notImportedCsv", () => {
  it("zählt Status je Position und exportiert nur nicht Gespeichertes", async () => {
    const job = await buildJob(
      [e("Bolt", 1, { quantity: 4 }), e("Opt", 2), e("Unsinn", 3), e("Brainstorm", 4)],
      { source: "t", mode: "text", allowDuplicates: false }
    );
    const [batch] = job.batches;
    batch.status = "done";
    batch.results = {
      0: { status: "imported" },
      1: { status: "skipped" },
      2: { status: "not_found" },
      3: { status: "error" },
    };
    const s = summarizeJob(job);
    expect(s.imported).toEqual({ items: 1, cards: 4 });
    expect(s.not_found.items).toBe(1);
    expect(s.batchesDone).toBe(1);

    const csv = notImportedCsv(job).trim().split("\n");
    expect(csv[0]).toBe("Count,Name,Foil,Status");
    expect(csv.slice(1)).toEqual(["1,Unsinn,,not_found", "1,Brainstorm,,error"]);
  });

  it("Paket mit Fehler → alle Positionen ohne Ergebnis gelten als Fehler", async () => {
    const job = await buildJob([e("Bolt", 1), e("Opt", 2)], { source: "t", mode: "text", allowDuplicates: false });
    job.batches[0].status = "error";
    expect(summarizeJob(job).error.items).toBe(2);
  });
});
