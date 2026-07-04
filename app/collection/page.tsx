import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CollectionClient } from "@/components/CollectionClient";

export default async function CollectionPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: cards, error } = await supabase
    .from("cards")
    .select("*")
    .order("name", { ascending: true });

  return (
    <CollectionClient
      initialCards={cards ?? []}
      userEmail={user.email ?? ""}
      loadError={error?.message}
    />
  );
}
