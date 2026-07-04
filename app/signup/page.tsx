"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

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
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-sm text-center space-y-3">
          <h1 className="text-xl font-semibold">Fast geschafft!</h1>
          <p className="text-zinc-400">
            Wir haben dir eine Bestätigungs-E-Mail geschickt. Bitte klicke
            den Link darin an, um deinen Account zu aktivieren.
          </p>
          <Link href="/login" className="text-indigo-400 hover:underline">
            Zurück zum Login
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <form
        onSubmit={handleSignup}
        className="w-full max-w-sm bg-zinc-900 rounded-xl p-8 space-y-4 border border-zinc-800"
      >
        <h1 className="text-2xl font-semibold mb-2">Account erstellen</h1>

        <div className="space-y-1">
          <label className="text-sm text-zinc-400">E-Mail</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md bg-zinc-800 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-zinc-400">Passwort</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md bg-zinc-800 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-zinc-400">Passwort bestätigen</label>
          <input
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-md bg-zinc-800 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-600 hover:bg-indigo-500 transition rounded-md py-2 font-medium disabled:opacity-50"
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
    </main>
  );
}
