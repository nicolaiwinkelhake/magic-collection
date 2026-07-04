import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { StatsClient } from "@/components/StatsClient";

export default async function StatsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: history } = await supabase
    .from("collection_value_history")
    .select("captured_on, total_value_eur")
    .order("captured_on", { ascending: true });

  // Distinkte Karten für die Einzelkarten-Auswahl
  const { data: cards } = await supabase
    .from("cards")
    .select("scryfall_id, name")
    .order("name", { ascending: true });

  const uniqueCards = Array.from(
    new Map((cards ?? []).map((c) => [c.scryfall_id, c.name])).entries()
  ).map(([scryfall_id, name]) => ({ scryfall_id, name }));

  return (
    <StatsClient
      totalHistory={history ?? []}
      cards={uniqueCards}
    />
  );
}
