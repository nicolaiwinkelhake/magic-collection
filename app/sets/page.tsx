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

  const { data: cards } = await supabase
    .from("cards")
    .select("set_code, scryfall_id, name, image_url, quantity, foil, price_eur, type_line")
    .eq("user_id", user.id);

  const cardsBySet = new Map<string, typeof cards>();
  for (const c of cards ?? []) {
    if (!c.set_code) continue;
    if (!cardsBySet.has(c.set_code)) cardsBySet.set(c.set_code, []);
    cardsBySet.get(c.set_code)!.push(c);
  }

  const allSets = await fetchSets();
  const setInfo = new Map(allSets.map((s) => [s.code, s]));

  const rows = [...cardsBySet.entries()]
    .map(([code, setCards]) => {
      const info = setInfo.get(code);
      const uniqueIds = new Set(setCards!.map((c) => c.scryfall_id));
      return {
        code,
        name: info?.name ?? code.toUpperCase(),
        owned: uniqueIds.size,
        total: info?.card_count ?? 0,
        released: info?.released_at ?? "",
        cards: setCards!.sort((a, b) => a.name.localeCompare(b.name)),
      };
    })
    .sort((a, b) => (b.released > a.released ? 1 : -1));

  return <SetsClient rows={rows} />;
}
