import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  // "accept" (optional itemIds: nur diese Karten) | "decline" | "remove_item" (itemId)
  const body = await request.json().catch(() => ({}));
  const action = body.action;
  const isId = (x: unknown): x is string => typeof x === "string" && UUID.test(x);

  if (action === "remove_item") {
    if (!isId(body.itemId)) return NextResponse.json({ error: "Karte fehlt" }, { status: 400 });
    const { data, error } = await supabase.rpc("remove_trade_item", { p_item_id: body.itemId });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ status: data === 0 ? "cancelled" : "pending", left: data });
  }

  if (action === "accept") {
    const itemIds = Array.isArray(body.itemIds) ? body.itemIds.filter(isId) : null;
    if (itemIds && !itemIds.length) return NextResponse.json({ error: "Mindestens eine Karte auswählen" }, { status: 400 });
    const { error } = await supabase.rpc("accept_trade", {
      p_trade_id: params.id,
      ...(itemIds ? { p_item_ids: itemIds } : {}),
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
