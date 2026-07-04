import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  const { cardName, borrowerName, borrowerEmail, quantity, note } = await request.json();
  if (!cardName?.trim() || !borrowerName?.trim()) {
    return NextResponse.json(
      { error: "Karte und Name des Entleihers sind nötig" },
      { status: 400 }
    );
  }

  // Optional: registrierten Nutzer per E-Mail verknüpfen
  let borrowerId: string | null = null;
  if (borrowerEmail?.trim()) {
    const { data } = await supabase.rpc("find_user_by_email", {
      search_email: borrowerEmail.trim(),
    });
    if (data?.length) borrowerId = data[0].id;
  }

  const { error } = await supabase.from("loans").insert({
    lender_id: user.id,
    borrower_id: borrowerId,
    borrower_name: borrowerName.trim(),
    card_name: cardName.trim(),
    quantity: Math.max(1, parseInt(quantity, 10) || 1),
    note: note?.trim() || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  const { id, action } = await request.json();
  if (action === "return") {
    await supabase
      .from("loans")
      .update({ status: "returned", returned_at: new Date().toISOString() })
      .eq("id", id)
      .eq("lender_id", user.id);
  } else if (action === "delete") {
    await supabase.from("loans").delete().eq("id", id).eq("lender_id", user.id);
  }
  return NextResponse.json({ ok: true });
}
