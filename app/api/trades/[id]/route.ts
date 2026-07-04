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

  if (action === "accept") {
    const { error } = await supabase.rpc("accept_trade", {
      p_trade_id: params.id,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    // Werte-Snapshots beider Seiten werden beim nächsten Preis-Update
    // ohnehin neu berechnet; den eigenen aktualisieren wir direkt.
    await supabase.rpc("snapshot_collection_value");
    return NextResponse.json({ status: "accepted" });
  }

  if (action === "decline") {
    const { error } = await supabase.rpc("decline_trade", {
      p_trade_id: params.id,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ status: "resolved" });
  }

  return NextResponse.json({ error: "Unbekannte Aktion" }, { status: 400 });
}
