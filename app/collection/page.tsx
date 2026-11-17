import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CollectionClient } from "@/components/CollectionClient";
import { selectAll } from "@/lib/supabase/selectAll";
import type { Card } from "@/lib/types";
import { attachFolders } from "@/lib/folders";
import { loadFolderEntries } from "@/lib/folderEntries";
import { deckUsage } from "@/lib/deckUsage";

export default async function CollectionPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Alles gleichzeitig laden (statt nacheinander) – spart je Abfrage einen
  // Hin- und Rückweg zur Datenbank. Karten seitenweise: ohne Blättern zeigte
  // die Sammlung max. 1000 Einträge.
  let cards: Card[] = [];
  let error: { message: string } | null = null;
  const [loaded, { data: folders }, entries, { data: decks }, deckCards] = await Promise.all([
    selectAll<Card>(() => supabase.from("cards").select("*").order("name", { ascending: true }).order("id")).catch((e) => {
      error = { message: e instanceof Error ? e.message : "Unbekannter Fehler" };
      return [] as Card[];
    }),
    // Eigene Ordner + Zuordnungen (eine Karte kann in mehreren Ordnern
    // stehen). Fehlen die Tabellen noch, bleibt alles leer.
    supabase.from("folders").select("id, name, created_at").order("name"),
    loadFolderEntries(supabase, "card"),
    supabase.from("decks").select("id, name").eq("user_id", user.id),
    // In welchen Decks steckt welche Karte? (Anzeige in der Sammlung)
    selectAll<{ deck_id: string; name: string }>(() =>
      supabase.from("deck_cards").select("deck_id, name").eq("user_id", user.id).order("id"),
    ).catch(() => [] as Array<{ deck_id: string; name: string }>),
  ]);
  cards = loaded;
  cards = attachFolders(cards, entries);
  const uses = deckUsage(deckCards, decks ?? []);

  return (
    <CollectionClient
      initialCards={cards ?? []}
      loadError={(error as { message: string } | null)?.message}
      initialFolders={folders ?? []}
      deckUses={uses}
      decks={(decks ?? []).slice().sort((a, b) => a.name.localeCompare(b.name, "de"))}
    />
  );
}
