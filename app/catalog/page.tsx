import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchSets } from "@/lib/scryfall";
import { CatalogClient } from "@/components/CatalogClient";

export const dynamic = "force-dynamic";

// Seite „Katalog“: alle Magic-Karten durchsuchen (eine je Karte, Standarddruck).
export default async function CatalogPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Set-Liste für den Filter (von Scryfall, stündlich gecacht): neueste zuerst,
  // ohne Spielsteine, Andenken und rein digitale Sondersets
  const today = new Date().toISOString().slice(0, 10);
  const skip = new Set(["token", "memorabilia", "alchemy", "minigame", "treasure_chest", "vanguard"]);
  const sets = (await fetchSets().catch(() => []))
    .filter((s) => !skip.has(s.set_type) && s.released_at && s.released_at <= today)
    .sort((a, b) => b.released_at.localeCompare(a.released_at))
    .map((s) => ({ code: s.code, name: s.name }));

  return <CatalogClient sets={sets} />;
}
