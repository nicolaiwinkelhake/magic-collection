import { describe, expect, it } from "vitest";
import { loadBaseline } from "@/lib/priceBaseline";

// Nachbau von PostgREST: höchstens 1000 Zeilen je Abfrage, per .range blättern
function fakeSupabase(total: number) {
  const rows = Array.from({ length: total }, (_, i) => ({ scryfall_id: `id${i}`, captured_on: i === 5 ? "2026-11-20" : "2026-11-24", price_eur: i, price_eur_foil: null }));
  return {
    rpc: () => ({
      range: async (from: number, to: number) => ({ data: rows.slice(from, Math.min(to + 1, from + 1000)), error: null }),
    }),
  } as never;
}

describe("Ausgangspreise laden", () => {
  it("blättert über die 1000-Zeilen-Grenze hinaus", async () => {
    const { baseline, earliest } = await loadBaseline(fakeSupabase(1618), "2026-11-24");
    expect(Object.keys(baseline)).toHaveLength(1618);
    expect(baseline.id1617).toEqual([1617, null]);
    expect(earliest).toBe("2026-11-20");
  });
});
