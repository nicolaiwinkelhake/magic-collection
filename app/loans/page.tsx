import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { LoansClient } from "@/components/LoansClient";

export default async function LoansPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: loans } = await supabase.rpc("my_loans");

  return <LoansClient loans={loans ?? []} />;
}
