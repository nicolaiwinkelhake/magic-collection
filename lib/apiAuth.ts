import { createClient } from "@/lib/supabase/server";

// Zentraler Helfer für API-Routen: holt Supabase-Client + angemeldeten Nutzer
// in einem Schritt. Ersetzt den in jeder Route wiederholten Boilerplate.
//
// Verwendung:
//   const { supabase, user } = await requireUser();
//   if (!user) return unauthorized();
export async function requireUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export function unauthorized() {
  return Response.json({ error: "Nicht angemeldet" }, { status: 401 });
}
