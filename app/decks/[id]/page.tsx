import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { DeckDetailClient } from "@/components/DeckDetailClient";

export default async function DeckDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: deck } = await supabase
    .from("decks")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!deck) notFound();

  const { data: deckCards } = await supabase
    .from("deck_cards")
    .select("*")
    .eq("deck_id", params.id)
    .order("is_commander", { ascending: false })
    .order("name", { ascending: true });

  // Welche Deckkarten besitzt der Nutzer bereits in seiner Sammlung?
  const { data: owned } = await supabase
    .from("cards")
    .select("name")
    .eq("user_id", user.id);
  const ownedNames = new Set((owned ?? []).map((c) => c.name.toLowerCase()));

  const missing = (deckCards ?? []).filter(
    (c) => !c.is_commander && !ownedNames.has(c.name.toLowerCase())
  );

  // Tages-Snapshot des Deckwerts festhalten (für den Verlauf)
  await supabase.rpc("snapshot_deck_value", { p_deck_id: params.id });

  const { data: valueHistory } = await supabase
    .from("deck_value_history")
    .select("captured_on, total_value_eur")
    .eq("deck_id", params.id)
    .order("captured_on", { ascending: true });

  return (
    <DeckDetailClient
      deck={deck}
      initialCards={deckCards ?? []}
      missing={missing}
      valueHistory={valueHistory ?? []}
    />
  );
}
