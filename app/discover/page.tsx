import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DiscoverClient } from "@/components/DiscoverClient";

export const dynamic = "force-dynamic";

export default async function DiscoverPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <DiscoverClient />;
}
