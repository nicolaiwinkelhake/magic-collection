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

  return <SharedClient owners={owners ?? []} />;
}
