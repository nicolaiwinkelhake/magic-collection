import { requireUser, unauthorized } from "@/lib/apiAuth";
import { PERIODS, dayString, type Baseline } from "@/lib/priceChange";

export const dynamic = "force-dynamic";

// Frühere Preise der eigenen Karten für die Prozent-Anzeige in der Sammlung:
// je Zeitraum (gestern, vor 7, vor 30 Tagen) der Preis jeder Karte an diesem
// Tag aus dem gemeinsamen Preisverlauf. Eine Datenbankabfrage nur für die
// eigenen Drucke (Migration 043) – früher seitenweise über den ganzen
// Preisverlauf, das lief in den Zeitabbruch.
export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();

  const dates = PERIODS.map((p) => dayString(p.days));
  const { data, error } = await supabase.rpc("my_price_baselines", { p_dates: dates });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const byDate = (data ?? {}) as Record<string, Record<string, [unknown, unknown]>>;
  const out: Record<number, Baseline> = {};
  PERIODS.forEach((p, i) => {
    const day: Baseline = {};
    for (const [id, [eur, foil]] of Object.entries(byDate[dates[i]] ?? {})) day[id] = [toNum(eur), toNum(foil)];
    out[p.days] = day;
  });
  return Response.json({ baselines: out }, { headers: { "Cache-Control": "private, max-age=600" } });
}

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
