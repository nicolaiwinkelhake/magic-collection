"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export function AccountClient({ email }: { email: string }) {
  const router = useRouter();
  const supabase = createClient();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    if (password.length < 8) {
      setPwMsg("Das Passwort muss mindestens 8 Zeichen lang sein.");
      return;
    }
    if (password !== confirm) {
      setPwMsg("Die Passwörter stimmen nicht überein.");
      return;
    }
    setPwBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setPwBusy(false);
    if (error) {
      setPwMsg(`Fehler: ${error.message}`);
      return;
    }
    setPassword("");
    setConfirm("");
    setPwMsg("Passwort geändert ✓");
  }

  async function changeEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailMsg(null);
    if (!newEmail.trim()) return;
    setEmailBusy(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    setEmailBusy(false);
    if (error) {
      setEmailMsg(`Fehler: ${error.message}`);
      return;
    }
    setNewEmail("");
    setEmailMsg(
      "Bestätigungs-E-Mail verschickt. Die Adresse wird erst nach Bestätigung des Links aktiv."
    );
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <main className="max-w-md mx-auto px-4 py-8 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">⚙️ Account</h1>
        <Link href="/collection" className="text-indigo-400 hover:underline text-sm">
          Zur Sammlung
        </Link>
      </header>

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <p className="text-sm text-zinc-400">Angemeldet als</p>
        <p className="font-medium">{email}</p>
      </div>

      {/* Passwort ändern */}
      <form
        onSubmit={changePassword}
        className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3"
      >
        <h2 className="font-medium">Passwort ändern</h2>
        <input
          type="password"
          placeholder="Neues Passwort"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md bg-zinc-800 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <input
          type="password"
          placeholder="Neues Passwort bestätigen"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full rounded-md bg-zinc-800 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {pwMsg && (
          <p
            className={`text-sm ${
              pwMsg.includes("✓") ? "text-emerald-400" : "text-zinc-300"
            }`}
          >
            {pwMsg}
          </p>
        )}
        <button
          type="submit"
          disabled={pwBusy}
          className="bg-indigo-600 hover:bg-indigo-500 transition rounded-md px-4 py-2 font-medium disabled:opacity-50"
        >
          {pwBusy ? "Speichere..." : "Passwort ändern"}
        </button>
      </form>

      {/* E-Mail ändern */}
      <form
        onSubmit={changeEmail}
        className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3"
      >
        <h2 className="font-medium">E-Mail-Adresse ändern</h2>
        <input
          type="email"
          placeholder="Neue E-Mail-Adresse"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          className="w-full rounded-md bg-zinc-800 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {emailMsg && <p className="text-sm text-zinc-300">{emailMsg}</p>}
        <button
          type="submit"
          disabled={emailBusy}
          className="bg-indigo-600 hover:bg-indigo-500 transition rounded-md px-4 py-2 font-medium disabled:opacity-50"
        >
          {emailBusy ? "Sende..." : "E-Mail ändern"}
        </button>
      </form>

      <button
        onClick={logout}
        className="text-red-400 hover:underline text-sm"
      >
        Abmelden
      </button>
    </main>
  );
}
