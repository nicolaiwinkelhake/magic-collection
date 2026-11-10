import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ScanClient } from "@/components/ScanClient";

export default async function ScanPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Decks als mögliches Ziel für gescannte Karten
  const { data: decks } = await supabase
    .from("decks")
    .select("id, name")
    .order("created_at", { ascending: false });

  return <ScanClient decks={decks ?? []} />;
}
