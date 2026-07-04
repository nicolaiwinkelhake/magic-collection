import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { fetchSets } from "@/lib/scryfall";
import { SetsClient } from "@/components/SetsClient";

export default async function SetsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Eigene Karten: distinkte Drucke je Set zählen
  const { data: cards } = await supabase
    .from("cards")
    .select("set_code, scryfall_id")
    .eq("user_id", user.id);

  const ownedBySet = new Map<string, Set<string>>();
  for (const c of cards ?? []) {
    if (!c.set_code) continue;
    if (!ownedBySet.has(c.set_code)) ownedBySet.set(c.set_code, new Set());
    ownedBySet.get(c.set_code)!.add(c.scryfall_id);
  }

  const allSets = await fetchSets();
  const setInfo = new Map(allSets.map((s) => [s.code, s]));

  const rows = [...ownedBySet.entries()]
    .map(([code, ids]) => {
      const info = setInfo.get(code);
      return {
        code,
        name: info?.name ?? code.toUpperCase(),
        owned: ids.size,
        total: info?.card_count ?? 0,
        released: info?.released_at ?? "",
      };
    })
    .sort((a, b) => (b.released > a.released ? 1 : -1));

  return <SetsClient rows={rows} />;
}
