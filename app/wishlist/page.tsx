import { createClient } from "@/lib/supabase/server";
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

  // Für jede Wunschkarte prüfen, welche Freunde sie besitzen – in kleinen
  // parallelen Gruppen statt einzeln nacheinander (große Wunschlisten
  // luden sonst sehr lange).
  const ownership: Record<string, string[]> = {};
  const names = Array.from(new Set(items.map((i) => i.name)));
  for (let start = 0; start < names.length; start += 10) {
    await Promise.all(
      names.slice(start, start + 10).map(async (name) => {
        const { data } = await supabase.rpc("friends_owning_card", { card_name: name });
        if (data?.length) ownership[name] = data.map((r: { friend_email: string }) => r.friend_email);
      }),
    );
  }

  // Eigene Ordner (gemeinsam mit der Sammlung) + Zuordnungen der Wunschkarten
  const [{ data: folders }, entries] = await Promise.all([
    supabase.from("folders").select("id, name, created_at").order("name"),
    loadFolderEntries(supabase, "wishlist"),
  ]);

  return <WishlistClient items={attachFolders(items, entries)} ownership={ownership} initialFolders={folders ?? []} />;
}
