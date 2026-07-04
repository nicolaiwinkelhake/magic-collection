import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  const { email } = await request.json();
  const { data: found } = await supabase.rpc("find_user_by_email", {
    search_email: (email ?? "").trim(),
  });
  if (!found?.length) {
    return NextResponse.json({ error: "Nutzer nicht gefunden" }, { status: 404 });
  }
  const viewerId = found[0].id;
  if (viewerId === user.id) {
    return NextResponse.json({ error: "Nicht nötig – das ist deine eigene Sammlung" }, { status: 400 });
  }

  const { error } = await supabase
    .from("collection_shares")
    .upsert({ owner_id: user.id, viewer_id: viewerId }, { onConflict: "owner_id,viewer_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  const { viewerId } = await request.json();
  await supabase
    .from("collection_shares")
    .delete()
    .eq("owner_id", user.id)
    .eq("viewer_id", viewerId);
  return NextResponse.json({ ok: true });
}
