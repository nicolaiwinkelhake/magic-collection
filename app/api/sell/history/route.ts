import { requireUser, unauthorized } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

// Verkaufshistorie (neueste zuerst, max. 300)
export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) return unauthorized();
  const { data, error } = await supabase
    .from("sales")
    .select("id, channel, listing, name, set_code, collector_number, foil, condition, language, quantity, price_eur, sold_at")
    .eq("user_id", user.id)
    .order("sold_at", { ascending: false })
    .limit(300);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ sales: data ?? [] });
}
