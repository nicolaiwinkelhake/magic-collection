"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AuthShell } from "@/components/ui/AuthShell";

// Ziel des Links aus der "Passwort vergessen"-Mail. Die Sitzung wurde in
// /auth/callback angelegt; ohne Sitzung leitet die Middleware zum Login.
export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    const { error } = await createClient().auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(
        error.code === "same_password"
          ? "Das neue Passwort muss sich vom alten unterscheiden."
          : `Passwort konnte nicht gespeichert werden: ${error.message}`,
      );
      return;
    }
    router.push("/collection");
    router.refresh();
  }

  return (
    <AuthShell>
      <form
        onSubmit={handleSubmit}
        className="surface-strong p-6 space-y-4"
      >
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
        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full"
        >
          {loading ? "Speichere..." : "Passwort speichern"}
        </button>
      </form>
    </AuthShell>
  );
}
