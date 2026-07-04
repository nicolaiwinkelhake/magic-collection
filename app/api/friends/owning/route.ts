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

  const { names }: { names: string[] } = await request.json();

  const result: Record<string, { friendEmail: string; quantity: number }[]> = {};

  // Sequenziell, um die DB nicht mit Parallel-Calls zu fluten – bei
  // einer typischen Deckgröße (100 Karten) ist das schnell genug.
  for (const name of names) {
    const { data, error } = await supabase.rpc("friends_owning_card", {
      card_name: name,
    });
    if (!error && data?.length) {
      result[name] = data.map((row: any) => ({
        friendEmail: row.friend_email,
        quantity: row.quantity,
      }));
    }
  }

  return NextResponse.json({ result });
}
