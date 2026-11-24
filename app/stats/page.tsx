import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { StatsClient } from "@/components/StatsClient";
import { selectAll } from "@/lib/supabase/selectAll";
import type { Card } from "@/lib/types";

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

  // Karten für Gewinner/Verlierer und die Einzelkarten-Auswahl
  const cards = await selectAll<Card>(() =>
    supabase.from("cards").select("*").order("name", { ascending: true }).order("id")
  );

  const uniqueCards = Array.from(
    new Map(cards.map((c) => [c.scryfall_id, c.name])).entries()
  ).map(([scryfall_id, name]) => ({ scryfall_id, name }));

  return (
    <StatsClient
      totalHistory={history ?? []}
      cards={uniqueCards}
      owned={cards}
    />
  );
}
