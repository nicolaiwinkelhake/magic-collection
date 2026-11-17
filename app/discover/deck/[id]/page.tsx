import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DeckAnalysisClient } from "@/components/DeckAnalysisClient";

// Deck-Analyse: die wichtigsten Schritte + Vorschläge für ein Deck.
export default async function DeckAnalysisPage({ params }: { params: { id: string } }) {
  const {
    data: { user },
  } = await createClient().auth.getUser();
  if (!user) redirect("/login");
  return <DeckAnalysisClient id={params.id} />;
}
