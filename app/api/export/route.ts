import { createClient } from "@/lib/supabase/server";
import { entriesToCsv } from "@/lib/csv";
import { selectAll } from "@/lib/supabase/selectAll";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response("Nicht angemeldet", { status: 401 });
  }

  // Seitenweise laden: sonst enthielt der Export max. 1000 Einträge.
  const cards = await selectAll<Parameters<typeof entriesToCsv>[0][number]>(() =>
    supabase
      .from("cards")
      .select("name, quantity, foil, set_code, price_eur, price_eur_foil, condition, language")
      .eq("user_id", user.id)
      .order("name", { ascending: true })
      .order("id")
  );

  const csv = entriesToCsv(cards);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="magic-collection.csv"`,
    },
  });
}
