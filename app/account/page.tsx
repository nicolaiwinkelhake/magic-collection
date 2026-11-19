import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AccountClient } from "@/components/AccountClient";
import { CatalogAdmin } from "@/components/CatalogAdmin";

export default async function AccountPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Wartung nur für Admins: Stand des Karten-Katalogs
  const { data: admin } = await supabase.from("app_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  let catalog: React.ComponentProps<typeof CatalogAdmin> | null = null;
  if (admin) {
    const [{ data: meta }, { count }] = await Promise.all([
      supabase.from("catalog_meta").select("key, value"),
      supabase.from("catalog_cards").select("id", { count: "estimated", head: true }),
    ]);
    const m = Object.fromEntries((meta ?? []).map((r) => [r.key, r.value]));
    catalog = { cards: m.cards ?? null, names: m.names ?? null, error: m.cards_error ?? m.names_error ?? null, count: count ?? null };
  }

  return <AccountClient email={user.email ?? ""} admin={catalog ? <CatalogAdmin {...catalog} /> : null} />;
}
