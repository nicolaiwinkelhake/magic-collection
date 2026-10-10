import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CollectionClient } from "@/components/CollectionClient";
import { selectAll } from "@/lib/supabase/selectAll";
import type { Card } from "@/lib/types";

export default async function CollectionPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Seitenweise laden: ohne Blättern zeigte die Sammlung max. 1000 Einträge.
  let cards: Card[] = [];
  let error: { message: string } | null = null;
  try {
    cards = await selectAll<Card>(() =>
      supabase.from("cards").select("*").order("name", { ascending: true }).order("id")
    );
  } catch (e) {
    error = { message: e instanceof Error ? e.message : "Unbekannter Fehler" };
  }

  return (
    <CollectionClient
      initialCards={cards ?? []}
      userEmail={user.email ?? ""}
      loadError={error?.message}
    />
  );
}
