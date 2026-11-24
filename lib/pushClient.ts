// Push-Abo dieses Geräts verwalten (Browser).
import { createClient } from "@/lib/supabase/client";

export type PushSupport = "ok" | "unsupported" | "ios-needs-install" | "denied";

export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** Kann dieses Gerät Push-Mitteilungen bekommen – und wenn nicht, warum? */
export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  // iPhone: nur als Homescreen-App (ab iOS 16.4)
  if (ios && !isStandalone()) return "ios-needs-install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return "ok";
}

/** VAPID-Schlüssel (Base64-URL) → Bytes (rein). */
export function keyToBytes(base64url: string): Uint8Array {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const b64 = (base64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration() {
  return (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
}

async function save(sub: PushSubscription) {
  const json = sub.toJSON();
  const { error } = await createClient().rpc("push_subscribe", {
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys?.p256dh ?? "",
    p_auth: json.keys?.auth ?? "",
    p_user_agent: navigator.userAgent,
  });
  if (error) throw new Error(error.message);
}

/** Hat dieses Gerät ein Abo? */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== "ok") return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Erlaubnis fragen und dieses Gerät anmelden. */
export async function enablePush(): Promise<void> {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) throw new Error("Mitteilungen sind auf dem Server noch nicht eingerichtet.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Mitteilungen wurden nicht erlaubt. Du kannst sie in den Einstellungen des Browsers freigeben.");
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(key) as BufferSource }));
  await save(sub);
}

/** Dieses Gerät abmelden. */
export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await createClient().from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
}

/** Beim Start: vorhandenes Abo dem angemeldeten Nutzer zuordnen (z. B. nach Neuanmeldung). */
export async function refreshPush(): Promise<void> {
  try {
    if (pushSupport() !== "ok" || Notification.permission !== "granted") return;
    const sub = await currentSubscription();
    if (sub) await save(sub);
  } catch {
    // nächstes Mal
  }
}
