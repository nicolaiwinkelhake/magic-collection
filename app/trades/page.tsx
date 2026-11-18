import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { uniqueFriends } from "@/lib/friends";
import { TradesClient } from "@/components/TradesClient";

export default async function TradesPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: trades } = await supabase.rpc("my_trades");
  const { data: friendships } = await supabase.rpc("my_friendships");

  const friends = uniqueFriends(friendships ?? []).map((f) => f.other_user_email);

  return (
    <TradesClient
      currentUserId={user.id}
      trades={trades ?? []}
      friends={friends}
    />
  );
}
