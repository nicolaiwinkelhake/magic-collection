import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const { email } = await request.json();

  if (!email?.trim()) {
    return NextResponse.json({ error: "E-Mail erforderlich" }, { status: 400 });
  }

  if (email.trim().toLowerCase() === user.email?.toLowerCase()) {
    return NextResponse.json(
      { error: "Du kannst dich nicht selbst hinzufügen" },
      { status: 400 }
    );
  }

  const { data: found, error: lookupError } = await supabase.rpc(
    "find_user_by_email",
    { search_email: email.trim() }
  );

  if (lookupError || !found?.length) {
    return NextResponse.json(
      { error: "Kein Nutzer mit dieser E-Mail gefunden" },
      { status: 404 }
    );
  }

  const friendId = found[0].id;

  // Falls die Gegenseite bereits eine Anfrage geschickt hat -> direkt annehmen
  const { data: existingReverse } = await supabase
    .from("friendships")
    .select("id, status")
    .eq("user_id", friendId)
    .eq("friend_id", user.id)
    .maybeSingle();

  if (existingReverse) {
    await supabase
      .from("friendships")
      .update({ status: "accepted" })
      .eq("id", existingReverse.id);

    await supabase.from("friendships").insert({
      user_id: user.id,
      friend_id: friendId,
      status: "accepted",
    });

    return NextResponse.json({ status: "accepted" });
  }

  const { error } = await supabase.from("friendships").insert({
    user_id: user.id,
    friend_id: friendId,
    status: "pending",
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: "pending" });
}
