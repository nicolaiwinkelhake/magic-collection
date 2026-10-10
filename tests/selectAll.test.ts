import { describe, it, expect } from "vitest";
import { selectAll } from "@/lib/supabase/selectAll";

// Simuliert eine PostgREST-Abfrage über n Zeilen mit Seitenlimit.
function fakeTable(n: number, error?: string) {
  const calls: Array<[number, number]> = [];
  const make = () => ({
    range(from: number, to: number) {
      calls.push([from, to]);
      if (error) return Promise.resolve({ data: null, error: { message: error } });
      const data = Array.from({ length: Math.max(0, Math.min(to, n - 1) - from + 1) }, (_, i) => from + i);
      return Promise.resolve({ data, error: null });
    },
  });
  return { make, calls };
}

describe("selectAll", () => {
  it("lädt alle Zeilen über mehrere Seiten", async () => {
    const t = fakeTable(2500);
    const rows = await selectAll<number>(t.make, 1000);
    expect(rows).toHaveLength(2500);
    expect(rows[2499]).toBe(2499);
    expect(t.calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("fragt bei genau voller Seite noch eine leere Seite ab", async () => {
    const t = fakeTable(1000);
    expect(await selectAll<number>(t.make, 1000)).toHaveLength(1000);
    expect(t.calls).toHaveLength(2);
  });

  it("wirft bei Fehler statt Teilergebnis zu liefern", async () => {
    await expect(selectAll(fakeTable(10, "kaputt").make)).rejects.toThrow("kaputt");
  });
});
