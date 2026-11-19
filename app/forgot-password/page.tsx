"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createRecoveryClient } from "@/lib/supabase/recoveryClient";
import { AuthShell } from "@/components/ui/AuthShell";

// "Passwort vergessen": Supabase schickt eine Mail mit Link. Der Link führt
// direkt auf /reset-password und bringt die Sitzung mit – klappt daher auch,
// wenn die Mail in einem anderen Browser oder auf dem Handy geöffnet wird.
function ForgotPasswordForm() {
  const params = useSearchParams();
  const linkError = params.get("error") === "link";
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await createRecoveryClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      setError(
        error.status === 429
          ? "Zu viele Anfragen. Bitte warte ein paar Minuten und versuche es erneut."
          : "Die E-Mail konnte nicht gesendet werden. Bitte später erneut versuchen.",
      );
      return;
    }
    // Immer gleiche Meldung – verrät nicht, ob es die Adresse gibt.
    setSent(true);
  }

  return (
    <AuthShell>
      <form
        onSubmit={handleSubmit}
        className="surface-strong p-6 space-y-4"
      >
        <h1 className="text-xl font-semibold">Passwort vergessen</h1>

        {linkError && !sent && (
          <p className="text-sm text-amber-300">
            Der Link ist abgelaufen oder wurde schon benutzt. Fordere hier einen neuen an.
          </p>
        )}

        {sent ? (
          <p className="text-sm text-zinc-300">
            Falls ein Konto zu <span className="font-medium">{email}</span> existiert, haben wir dir eine E-Mail
            mit einem Link zum Zurücksetzen geschickt. Der Link gilt eine Stunde und nur einmal.
          </p>
        ) : (
          <>
            <p className="text-sm text-zinc-400">
              Gib deine E-Mail-Adresse ein. Du bekommst einen Link, mit dem du ein neues Passwort festlegen kannst.
            </p>
            <div className="space-y-1">
              <label htmlFor="email" className="text-sm text-zinc-400">
                E-Mail
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? "Sende..." : "Link senden"}
            </button>
          </>
        )}

        <p className="text-sm text-zinc-400 text-center">
          <Link href="/login" className="text-indigo-400 hover:underline">
            Zurück zur Anmeldung
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <ForgotPasswordForm />
    </Suspense>
  );
}
