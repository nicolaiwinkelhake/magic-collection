import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const { action } = await request.json(); // "accept" | "decline"

  const { data: request_row } = await supabase
    .from("friendships")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!request_row || request_row.friend_id !== user.id) {
    return NextResponse.json({ error: "Anfrage nicht gefunden" }, { status: 404 });
  }

  if (action === "decline") {
    await supabase.from("friendships").delete().eq("id", params.id);
    return NextResponse.json({ status: "declined" });
  }

  // accept: bestehenden Eintrag bestätigen + Gegenrichtung anlegen,
  // damit beide Seiten sich gegenseitig als "accepted" sehen
  await supabase
    .from("friendships")
    .update({ status: "accepted" })
    .eq("id", params.id);

  await supabase.from("friendships").insert({
    user_id: user.id,
    friend_id: request_row.user_id,
    status: "accepted",
  });

  return NextResponse.json({ status: "accepted" });
}
