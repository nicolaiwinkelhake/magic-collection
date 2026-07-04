"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

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
    <main className="min-h-screen flex items-center justify-center px-4">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-sm bg-zinc-900 rounded-xl p-8 space-y-4 border border-zinc-800"
      >
        <h1 className="text-2xl font-semibold mb-2">Anmelden</h1>

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

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-600 hover:bg-indigo-500 transition rounded-md py-2 font-medium disabled:opacity-50"
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
    </main>
  );
}
