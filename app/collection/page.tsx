import { createClient } from "@/lib/supabase/server";
import { labelFolders } from "@/lib/folderLabels";
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
    supabase.from("folders").select("id, name, created_at, parent_id").order("name"),
    loadFolderEntries(supabase, "card"),
    supabase.from("decks").select("id, name").eq("user_id", user.id),
    // In welchen Decks steckt welche Karte? (Anzeige in der Sammlung)
    selectAll<{ deck_id: string; name: string; scryfall_id: string | null; foil: boolean | null }>(() =>
      supabase.from("deck_cards").select("deck_id, name, scryfall_id, foil").eq("user_id", user.id).order("id"),
    ).catch(() => [] as Array<{ deck_id: string; name: string; scryfall_id: string | null; foil: boolean | null }>),
  ]);
  cards = loaded;
  cards = attachFolders(cards, entries);
  const uses = deckUsage(deckCards, decks ?? [], cards);

  return (
    <CollectionClient
      initialCards={cards ?? []}
      loadError={(error as { message: string } | null)?.message}
      initialFolders={labelFolders(folders ?? [])}
      deckUses={uses}
      decks={(decks ?? []).slice().sort((a, b) => a.name.localeCompare(b.name, "de"))}
    />
  );
}
