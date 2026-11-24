// Push-Mitteilungen verschicken (nur Server). Liest Abos und Einstellungen
// mit dem Service-Role-Key, weil der Absender die Abos des Empfängers nicht
// sehen darf. Fehler beim Versand brechen nie die eigentliche Aktion ab.
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { wantsKind, type PushMessage } from "@/lib/pushMessages";

let configured: boolean | null = null;

function configure(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv || !process.env.SUPABASE_SERVICE_ROLE_KEY) return (configured = false);
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://magic-collection.vercel.app", pub, priv);
  return (configured = true);
}

type SubRow = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string };

/** Mitteilung an diese Nutzer (alle ihre Geräte), sofern sie die Art erlauben. */
export async function notify(
  userIds: (string | null | undefined)[],
  msg: PushMessage,
  opts: { ignorePrefs?: boolean } = {},
): Promise<number> {
  const ids = Array.from(new Set(userIds.filter((x): x is string => !!x)));
  if (!ids.length || !configure()) return 0;
  try {
    const admin = createAdminClient();
    const [{ data: subs }, { data: prefs }] = await Promise.all([
      admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", ids),
      admin.from("notification_prefs").select("*").in("user_id", ids),
    ]);
    const prefsOf = new Map((prefs ?? []).map((p) => [p.user_id as string, p]));
    const targets = ((subs ?? []) as SubRow[]).filter((s) => opts.ignorePrefs || wantsKind(prefsOf.get(s.user_id), msg.kind));
    const payload = JSON.stringify(msg);
    const gone: string[] = [];
    let sent = 0;
    await Promise.all(
      targets.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
            TTL: 60 * 60 * 24,
            urgency: "normal",
            timeout: 5000,
          });
          sent++;
        } catch (e) {
          // abgelaufenes oder abgemeldetes Gerät → Abo entfernen
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) gone.push(s.id);
        }
      }),
    );
    if (gone.length) await admin.from("push_subscriptions").delete().in("id", gone);
    return sent;
  } catch {
    return 0;
  }
}
