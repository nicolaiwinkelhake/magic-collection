import { createClient } from "@supabase/supabase-js";

// Admin-Client mit Service-Role-Key. NUR serverseitig verwenden (z. B. im
// Cron-Job) – umgeht Row Level Security. Der Key darf niemals ins Frontend
// gelangen. Erfordert die Umgebungsvariable SUPABASE_SERVICE_ROLE_KEY.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY ist nicht gesetzt");
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
