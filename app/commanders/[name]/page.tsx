import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CommanderClient } from "@/components/CommanderClient";

export const dynamic = "force-dynamic";

export default async function CommanderPage({
  params,
  searchParams,
}: {
  params: { name: string };
  searchParams: { partner?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Eigene Decks als Ziel für "+ Deck" (zuerst die mit diesem Commander).
  const name = decodeURIComponent(params.name);
  const { data: decks } = await supabase
    .from("decks")
    .select("id, name, commander_name")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  const sorted = (decks ?? []).sort(
    (a, b) => Number(b.commander_name === name) - Number(a.commander_name === name)
  );

  return (
    <CommanderClient
      name={name}
      partner={searchParams.partner ?? null}
      decks={sorted.map((d) => ({ id: d.id as string, name: d.name as string }))}
    />
  );
}
