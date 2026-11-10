import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safeNextPath";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    // Abgelaufener/fremder Link beim Zurücksetzen: neuen Link anfordern lassen.
    if (error && next === "/reset-password") {
      return NextResponse.redirect(`${origin}/forgot-password?error=link`);
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
