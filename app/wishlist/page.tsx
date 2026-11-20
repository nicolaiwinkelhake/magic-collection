import { createClient } from "@/lib/supabase/server";
import { labelFolders } from "@/lib/folderLabels";
import { redirect } from "next/navigation";
import { WishlistClient } from "@/components/WishlistClient";
import { selectAll } from "@/lib/supabase/selectAll";
import { attachFolders } from "@/lib/folders";
import { loadFolderEntries } from "@/lib/folderEntries";

export default async function WishlistPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Seitenweise laden: ohne Blättern zeigte die Liste max. 1000 Einträge.
  type WishRow = { id: string; name: string; image_url: string | null; price_eur: number | null };
  const items = await selectAll<WishRow>(() =>
    supabase.from("wishlist").select("*").order("name", { ascending: true }).order("id"),
  ).catch(() => [] as WishRow[]);

  // Welche Freunde besitzen die Wunschkarten? Eine Abfrage je 150 Namen
  // (statt je Karte eine – große Wunschlisten luden sonst sehr lange).
  const ownership: Record<string, string[]> = {};
  const names = Array.from(new Set(items.map((i) => i.name)));
  const chunks: string[][] = [];
  for (let start = 0; start < names.length; start += 150) chunks.push(names.slice(start, start + 150));
  const found = await Promise.all(chunks.map((chunk) => supabase.rpc("friends_owning_cards", { p_names: chunk })));
  for (const { data } of found) {
    for (const r of (data ?? []) as Array<{ name: string; friend_email: string }>) {
      (ownership[r.name] ??= []).push(r.friend_email);
    }
  }

  // Eigene Ordner (gemeinsam mit der Sammlung) + Zuordnungen der Wunschkarten
  const [{ data: folders }, entries] = await Promise.all([
    supabase.from("folders").select("id, name, created_at, parent_id").order("name"),
    loadFolderEntries(supabase, "wishlist"),
  ]);

  return <WishlistClient items={attachFolders(items, entries)} ownership={ownership} initialFolders={labelFolders(folders ?? [])} />;
}
