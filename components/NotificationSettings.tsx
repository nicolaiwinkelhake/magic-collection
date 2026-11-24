"use client";

// Konto → Mitteilungen & Feedback: Push auf diesem Gerät, welche Arten,
// dazu Töne und Vibration in der App.
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_PREFS, PUSH_KINDS, type NotificationPrefs, type PushKind } from "@/lib/pushMessages";
import { currentSubscription, disablePush, enablePush, pushSupport, type PushSupport } from "@/lib/pushClient";
import { fxEnabled, setFx } from "@/lib/fxSettings";
import { haptic } from "@/lib/haptics";
import { chime } from "@/lib/sounds";

function Switch({ on, onChange, label, hint, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="w-full flex items-center gap-3 py-2 text-left disabled:opacity-40"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm">{label}</span>
        {hint && <span className="block text-xs text-zinc-500">{hint}</span>}
      </span>
      <span className={`relative shrink-0 w-11 h-6 rounded-full transition ${on ? "bg-indigo-500" : "bg-white/15"}`}>
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? "left-[1.375rem]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

export function NotificationSettings({ userId }: { userId: string }) {
  const supabase = createClient();
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [sounds, setSounds] = useState(true);
  const [haptics, setHaptics] = useState(true);

  useEffect(() => {
    setSupport(pushSupport());
    setSounds(fxEnabled("sounds"));
    setHaptics(fxEnabled("haptics"));
    currentSubscription().then((s) => setSubscribed(!!s)).catch(() => {});
    supabase
      .from("notification_prefs")
      .select("trades, friends, shares, loans, wishlist, prices")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => data && setPrefs({ ...DEFAULT_PREFS, ...data }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function togglePush(on: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      if (on) {
        await enablePush();
        setSubscribed(true);
        haptic("success");
        setMsg("Mitteilungen sind auf diesem Gerät an.");
      } else {
        await disablePush();
        setSubscribed(false);
        setMsg("Mitteilungen sind auf diesem Gerät aus.");
      }
    } catch (e) {
      haptic("error");
      setMsg(e instanceof Error ? e.message : "Hat nicht geklappt.");
    } finally {
      setSupport(pushSupport());
      setBusy(false);
    }
  }

  async function setKind(kind: PushKind, on: boolean) {
    const next = { ...prefs, [kind]: on };
    setPrefs(next);
    haptic("tap");
    const { error } = await supabase.from("notification_prefs").upsert({ user_id: userId, ...next, updated_at: new Date().toISOString() });
    if (error) {
      setPrefs(prefs);
      setMsg("Konnte nicht gespeichert werden.");
    }
  }

  async function test() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Test fehlgeschlagen");
      setMsg(data.sent ? "Testmitteilung gesendet – sie sollte gleich erscheinen." : "Kein Gerät angemeldet.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Test fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="surface p-4 space-y-3">
      <h2 className="font-medium">Mitteilungen & Feedback</h2>

      {support === "ios-needs-install" && (
        <p className="text-sm text-amber-200/90 rounded-lg bg-amber-500/10 border border-amber-400/20 p-3">
          Auf dem iPhone gibt es Mitteilungen nur in der App auf dem Homescreen: In Safari <b>Teilen → Zum Home-Bildschirm</b>, dann die App von dort öffnen und hier einschalten.
        </p>
      )}
      {support === "unsupported" && <p className="text-sm text-zinc-400">Dieser Browser kann keine Mitteilungen empfangen.</p>}
      {support === "denied" && (
        <p className="text-sm text-zinc-400">Mitteilungen sind für diese Seite im Browser blockiert. Gib sie in den Browser- bzw. Systemeinstellungen frei.</p>
      )}

      <div className="divide-y divide-white/5">
        <Switch
          on={subscribed}
          onChange={togglePush}
          disabled={busy || support !== "ok"}
          label="Mitteilungen auf diesem Gerät"
          hint="Auch wenn die App geschlossen ist"
        />
        {PUSH_KINDS.map((k) => (
          <Switch key={k.kind} on={prefs[k.kind]} onChange={(v) => setKind(k.kind, v)} label={k.label} hint={k.hint} />
        ))}
        <Switch
          on={sounds}
          onChange={(v) => {
            setFx("sounds", v);
            setSounds(v);
            if (v) chime("trades");
          }}
          label="Töne in der App"
          hint="Eigener Ton je Mitteilung, wenn die App offen ist"
        />
        <Switch
          on={haptics}
          onChange={(v) => {
            setFx("haptics", v);
            setHaptics(v);
            if (v) haptic("success");
          }}
          label="Vibration"
          hint="Kurzes Feedback bei Aktionen und Mitteilungen"
        />
      </div>

      {msg && <p className="text-sm text-zinc-300">{msg}</p>}
      {subscribed && (
        <button type="button" onClick={test} disabled={busy} className="btn-secondary">
          Testmitteilung senden
        </button>
      )}
    </section>
  );
}
