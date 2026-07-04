import { createClient } from "@/lib/supabase/server";
import { entriesToCsv } from "@/lib/csv";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response("Nicht angemeldet", { status: 401 });
  }

  const { data: cards } = await supabase
    .from("cards")
    .select("name, quantity, foil, set_code, price_eur, price_eur_foil, condition, language")
    .eq("user_id", user.id)
    .order("name", { ascending: true });

  const csv = entriesToCsv(cards ?? []);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="magic-collection.csv"`,
    },
  });
}
