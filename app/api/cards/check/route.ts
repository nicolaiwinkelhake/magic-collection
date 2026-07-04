import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ owned: false }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name");
  if (!name) return NextResponse.json({ owned: false }, { status: 400 });

  const { data } = await supabase
    .from("cards")
    .select("id")
    .eq("user_id", user.id)
    .ilike("name", name)
    .limit(1);

  return NextResponse.json({ owned: (data ?? []).length > 0 });
}
