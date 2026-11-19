import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Eigener Client nur für „Passwort vergessen“. Der normale Browser-Client nutzt
// PKCE: Der Mail-Link funktioniert dann nur im selben Browser, in dem der Link
// angefordert wurde (Code-Verifier liegt dort). Wer die Mail auf dem Handy oder
// in einem anderen Browser öffnet, landete im Nichts. Hier deshalb der
// „implicit“-Ablauf: Der Link bringt die Sitzung selbst mit (#access_token=…)
// und klappt in jedem Browser. Nichts wird gespeichert – die Seite
// /reset-password setzt die Sitzung nur für das Ändern des Passworts.
export function createRecoveryClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: "implicit",
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
