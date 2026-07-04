import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AIDeckGeneratorClient } from "@/components/AIDeckGeneratorClient";

export default async function AIDeckGeneratorPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return <AIDeckGeneratorClient />;
}
