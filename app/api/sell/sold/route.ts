import { requireUser, unauthorized } from "@/lib/apiAuth";

// Als verkauft markieren – einzeln oder alle: bucht die Karten aus der
// Sammlung aus und schreibt die Verkaufshistorie (sell_entries, Migration 019).
// Erwartet { items: [{ entry_id, quantity, price }] }
export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();
  const body = await request.json().catch(() => ({}));
  const items = Array.isArray(body.items) ? body.items : [];
  const clean = items
    .filter((i: { entry_id?: unknown }) => typeof i?.entry_id === "string")
    .slice(0, 500)
    .map((i: { entry_id: string; quantity?: unknown; price?: unknown }) => ({
      entry_id: i.entry_id,
      quantity: Math.max(1, Math.floor(Number(i.quantity) || 1)),
      price: i.price == null || i.price === "" || !Number.isFinite(Number(i.price)) ? null : Math.round(Number(i.price) * 100) / 100,
    }));
  if (!clean.length) return Response.json({ error: "Keine Karten angegeben" }, { status: 400 });
  const { data, error } = await supabase.rpc("sell_entries", { p_items: clean });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ sold: data ?? 0 });
}
