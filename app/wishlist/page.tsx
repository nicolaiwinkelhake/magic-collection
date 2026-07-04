import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { WishlistClient } from "@/components/WishlistClient";

export default async function WishlistPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: items } = await supabase
    .from("wishlist")
    .select("*")
    .order("name", { ascending: true });

  // Für jede Wunschkarte prüfen, welche Freunde sie besitzen
  const ownership: Record<string, string[]> = {};
  for (const item of items ?? []) {
    const { data } = await supabase.rpc("friends_owning_card", {
      card_name: item.name,
    });
    if (data?.length) {
      ownership[item.name] = data.map((r: any) => r.friend_email);
    }
  }

  return <WishlistClient items={items ?? []} ownership={ownership} />;
}
