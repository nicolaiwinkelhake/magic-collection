// Preise zu Beginn eines Zeitraums laden (RPC price_baseline). PostgREST
// liefert je Abfrage höchstens 1000 Zeilen – ohne Blättern fehlten bei
// größeren Sammlungen Karten, und Wertsteigerung/Gewinner wären falsch.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Baseline } from "@/lib/priceChange";

const PAGE = 1000;

export type BaselineRow = { scryfall_id: string; captured_on: string; price_eur: number | null; price_eur_foil: number | null };

export async function loadBaseline(supabase: SupabaseClient, since: string): Promise<{ baseline: Baseline; earliest: string | null }> {
  const baseline: Baseline = {};
  let earliest: string | null = null;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.rpc("price_baseline", { p_since: since }).range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as BaselineRow[];
    for (const r of rows) {
      baseline[r.scryfall_id] = [r.price_eur == null ? null : Number(r.price_eur), r.price_eur_foil == null ? null : Number(r.price_eur_foil)];
      if (!earliest || r.captured_on < earliest) earliest = r.captured_on;
    }
    if (rows.length < PAGE) return { baseline, earliest };
  }
}
