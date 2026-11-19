import { beforeEach, describe, expect, it, vi } from "vitest";

// nachgebildete Datenbank für die Browser-Abfragen
const state: { meta: Array<{ key: string; value: unknown }>; cards: Array<Record<string, unknown>>; lookup: Array<Record<string, unknown>> } = { meta: [], cards: [], lookup: [] };
function query(table: string) {
  let rows = table === "catalog_meta" ? state.meta : state.cards;
  const q = {
    select: () => q,
    in: (col: string, vals: string[]) => ((rows = rows.filter((r) => vals.includes(String(r[col])))), q),
    eq: (col: string, v: string) => ((rows = rows.filter((r) => String(r[col]) === v)), q),
    order: () => q,
    limit: () => Promise.resolve({ data: rows }),
    maybeSingle: () => Promise.resolve({ data: rows[0] ?? null }),
    then: (res: (v: { data: unknown[] }) => unknown) => Promise.resolve({ data: rows }).then(res),
  };
  return q;
}
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: (t: string) => query(t), rpc: () => Promise.resolve({ data: state.lookup }) }),
}));

const card = (id: string, set: string, cn: string, released: string) => ({
  id, oracle_id: "o-bolt", name: "Lightning Bolt", name_de: "Blitzschlag", set, set_name: set.toUpperCase(), collector_number: cn,
  type_line: "Instant", image_url: `https://img/${id}.jpg`, eur: "1.50", eur_foil: null, released_at: released,
});

describe("Katalog im Browser", () => {
  beforeEach(() => {
    vi.resetModules();
    state.meta = [
      { key: "cards", value: { done: true, version: 2 } },
      { key: "defaults", value: { done: true } },
      { key: "lookup", value: { enabled: true } },
    ];
    state.cards = [card("a", "m10", "146", "2009-07-17"), card("b", "2xm", "117", "2020-08-07")];
    state.lookup = [{ input: "lightning bolt", oracle_id: "o-bolt", card_id: "b" }];
  });

  it("Set + Nummer und exakter Name aus dem Katalog", async () => {
    const { catalogPrint, catalogExact } = await import("@/lib/catalogClient");
    const p = await catalogPrint("M10", "146");
    expect(p).toMatchObject({ id: "a", set: "m10", eur: 1.5, exact: true, nameDe: "Blitzschlag" });
    expect((await catalogExact("Lightning Bolt"))?.id).toBe("b");
  });

  it("nicht freigeschaltet → nichts (Scryfall übernimmt)", async () => {
    state.meta = state.meta.filter((m) => m.key !== "lookup");
    const { catalogPrint, catalogPrints } = await import("@/lib/catalogClient");
    expect(await catalogPrint("m10", "146")).toBeNull();
    expect(await catalogPrints("Lightning Bolt")).toEqual([]);
  });

  it("Scanner: Set + Nummer, Name passt (auch deutsch gelesen)", async () => {
    const { directPrint } = await import("@/lib/scryfallDirect");
    expect((await directPrint("m10", "146", "DE", ["Blitzschlag"], true))?.id).toBe("a");
    expect(await directPrint("m10", "146", "EN", ["Counterspell"], true)).toBeNull();
  });

  it("Druckauswahl: Drucke zusammenführen ohne Doppelte, neueste zuerst", async () => {
    const { mergePrints } = await import("@/components/ui/PrintPicker");
    const a = [{ id: "x", name: "n", imageUrl: null, eur: null, eurFoil: null, releasedAt: "2020-01-01" }];
    const b = [{ id: "x", name: "n", imageUrl: null, eur: null, eurFoil: null, releasedAt: "2020-01-01" }, { id: "y", name: "n", imageUrl: null, eur: null, eurFoil: null, releasedAt: "2024-01-01" }];
    expect(mergePrints(a, b).map((p) => p.id)).toEqual(["y", "x"]);
  });
});
