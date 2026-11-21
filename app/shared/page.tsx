import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SharedClient } from "@/components/SharedClient";

export default async function SharedPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: owners } = await supabase.rpc("collections_shared_with_me");

  // Bestätigte Freunde, die ihre Sammlung (noch) nicht für mich freigegeben haben
  const { data: friendships } = await supabase.rpc("my_friendships");
  const sharing = new Set(((owners ?? []) as Array<{ owner_id: string }>).map((o) => o.owner_id));
  const notSharing = ((friendships ?? []) as Array<{ status: string; other_user_id: string; other_user_email: string }>)
    .filter((f) => f.status === "accepted" && !sharing.has(f.other_user_id))
    .map((f) => f.other_user_email.split("@")[0]);

  return <SharedClient owners={owners ?? []} notSharing={notSharing} />;
}
