import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { FriendsClient } from "@/components/FriendsClient";

export default async function FriendsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: friendships } = await supabase.rpc("my_friendships");

  // Wem habe ich meine Sammlung freigegeben?
  const { data: shares } = await supabase
    .from("collection_shares")
    .select("viewer_id")
    .eq("owner_id", user.id);

  const sharedWith = (shares ?? []).map((s) => s.viewer_id);

  return <FriendsClient friendships={friendships ?? []} sharedWith={sharedWith} />;
}
