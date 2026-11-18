import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SellClient } from "@/components/SellClient";

export const metadata = { title: "Extern verkaufen · Magic Collection" };

export default async function SellPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <SellClient />;
}
