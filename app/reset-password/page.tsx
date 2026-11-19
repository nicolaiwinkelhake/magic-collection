"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { createRecoveryClient } from "@/lib/supabase/recoveryClient";
import { AuthShell } from "@/components/ui/AuthShell";

// Ziel des Links aus der "Passwort vergessen"-Mail. Der Link bringt die
// Sitzung im Adress-Anker mit (#access_token=…&type=recovery) – das klappt in
// jedem Browser. Ältere Links (über /auth/callback) und Eingeloggte nutzen die
// normale Sitzung. Ohne beides: Hinweis, einen neuen Link anzufordern.

type Mode = "checking" | "ready" | "invalid";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Sitzung aus dem Mail-Link (nur im Speicher dieser Seite)
  const recovery = useRef<{ client: SupabaseClient; email: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      if (window.location.hash) {
        // Token nicht in der Adresszeile/Verlauf stehen lassen
        window.history.replaceState(null, "", window.location.pathname);
      }
      if (accessToken && refreshToken) {
        const client = createRecoveryClient();
        const { data, error } = await client.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (cancelled) return;
        if (!error && data.user?.email) {
          recovery.current = { client, email: data.user.email };
          setMode("ready");
          return;
        }
        setMode("invalid");
        return;
      }
      if (hash.get("error") || hash.get("error_code")) {
        setMode("invalid");
        return;
      }
      const { data } = await createClient().auth.getUser();
      if (!cancelled) setMode(data.user ? "ready" : "invalid");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Das Passwort muss mindestens 8 Zeichen lang sein.");
      return;
    }
    if (password !== confirm) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }
    setLoading(true);
    const rec = recovery.current;
    const { error } = await (rec ? rec.client : createClient()).auth.updateUser({ password });
    if (error) {
      setLoading(false);
      setError(
        error.code === "same_password"
          ? "Das neue Passwort muss sich vom alten unterscheiden."
          : `Passwort konnte nicht gespeichert werden: ${error.message}`,
      );
      return;
    }
    if (rec) {
      // Mit dem neuen Passwort normal anmelden (setzt die App-Sitzung)
      const { error: loginError } = await createClient().auth.signInWithPassword({
        email: rec.email,
        password,
      });
      if (loginError) {
        setLoading(false);
        router.push("/login");
        return;
      }
    }
    router.push("/collection");
    router.refresh();
  }

  if (mode === "checking") {
    return (
      <AuthShell>
        <div className="surface-strong p-6 text-sm text-zinc-400">Link wird geprüft …</div>
      </AuthShell>
    );
  }

  if (mode === "invalid") {
    return (
      <AuthShell>
        <div className="surface-strong p-6 space-y-4">
          <h1 className="text-xl font-semibold">Link ungültig</h1>
          <p className="text-sm text-zinc-300">
            Der Link ist abgelaufen oder wurde schon benutzt. Fordere einfach einen neuen an.
          </p>
          <Link href="/forgot-password" className="btn-primary w-full text-center block">
            Neuen Link anfordern
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <form onSubmit={handleSubmit} className="surface-strong p-6 space-y-4">
        <h1 className="text-xl font-semibold">Neues Passwort</h1>
        <div className="space-y-1">
          <label htmlFor="pw" className="text-sm text-zinc-400">
            Neues Passwort (mind. 8 Zeichen)
          </label>
          <input
            id="pw"
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="pw2" className="text-sm text-zinc-400">
            Passwort wiederholen
          </label>
          <input
            id="pw2"
            type="password"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="input"
          />
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? "Speichere..." : "Passwort speichern"}
        </button>
      </form>
    </AuthShell>
  );
}
