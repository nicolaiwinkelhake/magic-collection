import type { SupabaseClient } from "@supabase/supabase-js";
import { selectAll } from "@/lib/supabase/selectAll";

export type Channel = "cardmarket" | "kleinanzeigen";
export const ROOT_NAMES: Record<Channel, string> = {
  cardmarket: "Verkauf · Cardmarket",
  kleinanzeigen: "Verkauf · Kleinanzeigen",
};

export type SellFolder = { id: string; name: string; parent_id: string | null; channel: Channel | null; asking_price: number | null; created_at: string };

/** Die beiden Verkaufsordner anlegen, falls es sie noch nicht gibt. */
export async function ensureRoots(supabase: SupabaseClient, userId: string): Promise<Record<Channel, SellFolder>> {
  const cols = "id, name, parent_id, channel, asking_price, created_at";
  const { data, error } = await supabase.from("folders").select(cols).eq("user_id", userId).is("parent_id", null).not("channel", "is", null);
  if (error) throw new Error(error.message);
  const out = {} as Record<Channel, SellFolder>;
  for (const f of (data ?? []) as SellFolder[]) if (f.channel) out[f.channel] = f;
  for (const ch of ["cardmarket", "kleinanzeigen"] as Channel[]) {
    if (out[ch]) continue;
    const ins = await supabase.from("folders").insert({ user_id: userId, name: ROOT_NAMES[ch], channel: ch }).select(cols).single();
    if (!ins.error) { out[ch] = ins.data as SellFolder; continue; }
    if (ins.error.code !== "23505") throw new Error(ins.error.message);
    // Gleichnamiger Ordner existiert schon → zum Verkaufsordner machen
    const up = await supabase.from("folders").update({ channel: ch }).eq("user_id", userId).is("parent_id", null).ilike("name", ROOT_NAMES[ch]).select(cols).single();
    if (up.error) throw new Error(up.error.message);
    out[ch] = up.data as SellFolder;
  }
  return out;
}

export async function loadSellState(supabase: SupabaseClient, userId: string) {
  const roots = await ensureRoots(supabase, userId);
  const cols = "id, name, parent_id, channel, asking_price, created_at";
  const { data: ads, error } = await supabase.from("folders").select(cols).eq("user_id", userId).eq("parent_id", roots.kleinanzeigen.id).order("created_at");
  if (error) throw new Error(error.message);
  const folderIds = [roots.cardmarket.id, roots.kleinanzeigen.id, ...((ads ?? []) as SellFolder[]).map((a) => a.id)];
  const entries = await selectAll<Record<string, unknown>>(() =>
    supabase
      .from("folder_entries")
      .select("id, folder_id, asking_price, sell_quantity, created_at, card:cards(id, scryfall_id, name, name_de, set_code, collector_number, image_url, foil, quantity, condition, language, price_eur, price_eur_foil, rarity)")
      .in("folder_id", folderIds)
      .not("card_id", "is", null)
      .order("created_at")
      .order("id"),
  );
  return { roots, ads: (ads ?? []) as SellFolder[], entries: entries.filter((e) => e.card) };
}
