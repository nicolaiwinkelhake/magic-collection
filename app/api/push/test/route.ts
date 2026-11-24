import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notify } from "@/lib/push";
import { messages } from "@/lib/pushMessages";

// Testmitteilung an alle eigenen Geräte (Einstellungen → „Test senden“).
export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return NextResponse.json({ error: "Mitteilungen sind auf dem Server noch nicht eingerichtet" }, { status: 503 });
  }
  const sent = await notify([user.id], messages.test(), { ignorePrefs: true });
  return NextResponse.json({ sent });
}
