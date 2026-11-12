import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CollectionClient } from "@/components/CollectionClient";
import { selectAll } from "@/lib/supabase/selectAll";
import type { Card } from "@/lib/types";
import { attachFolders } from "@/lib/folders";
import { loadFolderEntries } from "@/lib/folderEntries";

export default async function CollectionPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Seitenweise laden: ohne Blättern zeigte die Sammlung max. 1000 Einträge.
  let cards: Card[] = [];
  let error: { message: string } | null = null;
  try {
    cards = await selectAll<Card>(() =>
      supabase.from("cards").select("*").order("name", { ascending: true }).order("id")
    );
  } catch (e) {
    error = { message: e instanceof Error ? e.message : "Unbekannter Fehler" };
  }

  // Eigene Ordner + Zuordnungen (eine Karte kann in mehreren Ordnern
  // stehen). Fehlen die Tabellen noch, bleibt alles leer.
  const [{ data: folders }, entries] = await Promise.all([
    supabase.from("folders").select("id, name, created_at").order("name"),
    loadFolderEntries(supabase, "card"),
  ]);
  cards = attachFolders(cards, entries);

  return (
    <CollectionClient
      initialCards={cards ?? []}
      loadError={error?.message}
      initialFolders={folders ?? []}
    />
  );
}
