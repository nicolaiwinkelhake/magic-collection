"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { AuthShell } from "@/components/ui/AuthShell";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setError("E-Mail oder Passwort ist falsch.");
      return;
    }

    router.push("/collection");
    router.refresh();
  }

  return (
    <AuthShell>
      <form
        onSubmit={handleLogin}
        className="surface-strong p-6 space-y-4"
      >
        <h1 className="text-xl font-semibold">Anmelden</h1>

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
          <div className="flex items-center justify-between">
            <label className="text-sm text-zinc-400">Passwort</label>
            <Link href="/forgot-password" className="text-sm text-indigo-400 hover:underline">
              Passwort vergessen?
            </Link>
          </div>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
          />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full"
        >
          {loading ? "Anmelden..." : "Anmelden"}
        </button>

        <p className="text-sm text-zinc-400 text-center">
          Noch keinen Account?{" "}
          <Link href="/signup" className="text-indigo-400 hover:underline">
            Registrieren
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
