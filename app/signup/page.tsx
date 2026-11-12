"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AuthShell } from "@/components/ui/AuthShell";

export default function SignupPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Das Passwort muss mindestens 8 Zeichen lang sein.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setSuccess(true);
  }

  if (success) {
    return (
      <AuthShell>
        <div className="surface-strong p-6 text-center space-y-3">
          <h1 className="text-xl font-semibold">Fast geschafft!</h1>
          <p className="text-zinc-400">
            Wir haben dir eine Bestätigungs-E-Mail geschickt. Bitte klicke
            den Link darin an, um deinen Account zu aktivieren.
          </p>
          <Link href="/login" className="text-indigo-400 hover:underline">
            Zurück zum Login
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <form
        onSubmit={handleSignup}
        className="surface-strong p-6 space-y-4"
      >
        <h1 className="text-xl font-semibold">Account erstellen</h1>

        <div className="space-y-1">
          <label className="text-sm text-zinc-400">E-Mail</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-zinc-400">Passwort</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-zinc-400">Passwort bestätigen</label>
          <input
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="input"
          />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full"
        >
          {loading ? "Wird erstellt..." : "Registrieren"}
        </button>

        <p className="text-sm text-zinc-400 text-center">
          Schon einen Account?{" "}
          <Link href="/login" className="text-indigo-400 hover:underline">
            Anmelden
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
