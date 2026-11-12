// Ordner-Zuordnungen (folder_entries, Migration 015) serverseitig laden –
// seitenweise, damit auch große Sammlungen vollständig sind. Fehlt die
// Tabelle (Migration noch nicht eingespielt), bleibt die Liste leer.
import type { SupabaseClient } from "@supabase/supabase-js";
import { selectAll } from "@/lib/supabase/selectAll";

type Kind = "card" | "wishlist";

export async function loadFolderEntries(
  supabase: SupabaseClient,
  kind: Kind,
): Promise<Array<{ folder_id: string; target: string | null }>> {
  const column = kind === "card" ? "card_id" : "wishlist_id";
  type Row = { id: string; folder_id: string; card_id: string | null; wishlist_id: string | null };
  const rows = await selectAll<Row>(() =>
    supabase.from("folder_entries").select("id, folder_id, card_id, wishlist_id").not(column, "is", null).order("id"),
  ).catch(() => [] as Row[]);
  return rows.map((r) => ({ folder_id: r.folder_id, target: kind === "card" ? r.card_id : r.wishlist_id }));
}
