import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { fetchSets } from "@/lib/scryfall";
import { SetsClient } from "@/components/SetsClient";
import { setValueMoves, sortByPercent, upcomingSets } from "@/lib/setsView";
import { dayString } from "@/lib/priceChange";
import { selectAll } from "@/lib/supabase/selectAll";
import { catalogSetCounts } from "@/lib/catalogLookup";

export default async function SetsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const cards = await selectAll<{
    set_code: string | null;
    scryfall_id: string;
    name: string;
    image_url: string | null;
    quantity: number;
    foil: boolean;
    price_eur: number | null;
    price_eur_foil: number | null;
    type_line: string | null;
  }>(() =>
    supabase
      .from("cards")
      .select("set_code, scryfall_id, name, image_url, quantity, foil, price_eur, price_eur_foil, type_line")
      .eq("user_id", user.id)
      .order("id")
  );

  const cardsBySet = new Map<string, typeof cards>();
  for (const c of cards ?? []) {
    if (!c.set_code) continue;
    if (!cardsBySet.has(c.set_code)) cardsBySet.set(c.set_code, []);
    cardsBySet.get(c.set_code)!.push(c);
  }

  // Set-Größe: Papier-Drucke laut eigenem Katalog (ohne reine Online-Drucke),
  // sonst Scryfalls Kartenzahl
  const [allSets, printCounts, { data: base }] = await Promise.all([
    fetchSets(),
    catalogSetCounts(Array.from(cardsBySet.keys())),
    // Preise vor 7 Tagen: Wertzuwachs/-verlust je Set
    supabase.rpc("price_baseline", { p_since: dayString(7) }),
  ]);
  const baseline: Record<string, [number | null, number | null]> = {};
  for (const r of (base ?? []) as Array<{ scryfall_id: string; price_eur: number | null; price_eur_foil: number | null }>) {
    baseline[r.scryfall_id] = [r.price_eur == null ? null : Number(r.price_eur), r.price_eur_foil == null ? null : Number(r.price_eur_foil)];
  }
  const moves = setValueMoves(cards, baseline);
  const setInfo = new Map(allSets.map((s) => [s.code, s]));

  const rows = sortByPercent([...cardsBySet.entries()]
    .map(([code, setCards]) => {
      const info = setInfo.get(code);
      const uniqueIds = new Set(setCards!.map((c) => c.scryfall_id));
      return {
        code,
        name: info?.name ?? code.toUpperCase(),
        owned: uniqueIds.size,
        total: printCounts.get(code) ?? info?.card_count ?? 0,
        released: info?.released_at ?? "",
        icon: info?.icon_svg_uri ?? null,
        cards: setCards!.sort((a, b) => a.name.localeCompare(b.name)),
      };
    }));

  return <SetsClient rows={rows} upcoming={upcomingSets(allSets)} topUp={moves.up} topDown={moves.down} />;
}
