import { requireUser, unauthorized } from "@/lib/apiAuth";
import { selectAll } from "@/lib/supabase/selectAll";
import { PERIODS, dayString, type Baseline } from "@/lib/priceChange";

export const dynamic = "force-dynamic";

// Frühere Preise der eigenen Karten für die Prozent-Anzeige in der Sammlung:
// je Zeitraum (gestern, vor 7, vor 30 Tagen) der Preis jeder Karte an diesem
// Tag aus dem gemeinsamen Preisverlauf. Wird nach dem Seitenaufbau geladen,
// damit die Sammlung selbst nicht langsamer öffnet.
export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();

  const dates = PERIODS.map((p) => dayString(p.days));
  const [own, history] = await Promise.all([
    selectAll<{ scryfall_id: string | null }>(() =>
      supabase.from("cards").select("scryfall_id").eq("user_id", user.id).order("id"),
    ),
    selectAll<{ scryfall_id: string; captured_on: string; price_eur: number | null; price_eur_foil: number | null }>(() =>
      supabase
        .from("card_price_history")
        .select("scryfall_id, captured_on, price_eur, price_eur_foil")
        .in("captured_on", dates)
        .order("captured_on")
        .order("scryfall_id"),
    ),
  ]);

  const mine = new Set(own.map((c) => c.scryfall_id).filter(Boolean));
  const out: Record<number, Baseline> = {};
  PERIODS.forEach((p) => (out[p.days] = {}));
  const byDate = new Map(PERIODS.map((p, i) => [dates[i], out[p.days]]));
  for (const h of history) {
    if (!mine.has(h.scryfall_id)) continue;
    const target = byDate.get(h.captured_on);
    if (target) target[h.scryfall_id] = [toNum(h.price_eur), toNum(h.price_eur_foil)];
  }
  return Response.json({ baselines: out }, { headers: { "Cache-Control": "private, max-age=600" } });
}

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
