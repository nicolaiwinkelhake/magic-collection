"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/PageHeader";

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
    <main className="page max-w-md">
      <PageHeader title="Konto" />

      <div className="surface p-4">
        <p className="text-sm text-zinc-400">Angemeldet als</p>
        <p className="font-medium">{email}</p>
      </div>

      {/* Passwort ändern */}
      <form
        onSubmit={changePassword}
        className="surface p-4 space-y-3"
      >
        <h2 className="font-medium">Passwort ändern</h2>
        <input
          type="password"
          placeholder="Neues Passwort"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input"
        />
        <input
          type="password"
          placeholder="Neues Passwort bestätigen"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="input"
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
          className="btn-primary"
        >
          {pwBusy ? "Speichere..." : "Passwort ändern"}
        </button>
      </form>

      {/* E-Mail ändern */}
      <form
        onSubmit={changeEmail}
        className="surface p-4 space-y-3"
      >
        <h2 className="font-medium">E-Mail-Adresse ändern</h2>
        <input
          type="email"
          placeholder="Neue E-Mail-Adresse"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          className="input"
        />
        {emailMsg && <p className="text-sm text-zinc-300">{emailMsg}</p>}
        <button
          type="submit"
          disabled={emailBusy}
          className="btn-primary"
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
