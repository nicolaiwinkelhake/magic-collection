import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DecksClient } from "@/components/DecksClient";

export default async function DecksPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: decks } = await supabase
    .from("decks")
    .select("*")
    .order("created_at", { ascending: false });

  return <DecksClient initialDecks={decks ?? []} />;
}
