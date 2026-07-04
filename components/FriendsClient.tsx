"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type FriendshipRow = {
  id: string;
  status: "pending" | "accepted";
  direction: "incoming" | "outgoing";
  other_user_id: string;
  other_user_email: string;
  created_at: string;
};

export function FriendsClient({
  friendships,
  sharedWith = [],
}: {
  friendships: FriendshipRow[];
  sharedWith?: string[];
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function toggleShare(friend: FriendshipRow, on: boolean) {
    if (on) {
      await fetch("/api/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: friend.other_user_email }),
      });
    } else {
      await fetch("/api/shares", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewerId: friend.other_user_id }),
      });
    }
    router.refresh();
  }

  const accepted = friendships.filter((f) => f.status === "accepted");
  const incoming = friendships.filter(
    (f) => f.status === "pending" && f.direction === "incoming"
  );
  const outgoing = friendships.filter(
    (f) => f.status === "pending" && f.direction === "outgoing"
  );

  async function sendRequest(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const res = await fetch("/api/friends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setMessage(`Fehler: ${data.error}`);
      return;
    }

    setMessage(
      data.status === "accepted"
        ? "Ihr seid jetzt Freunde!"
        : "Anfrage gesendet."
    );
    setEmail("");
    router.refresh();
  }

  async function respond(id: string, action: "accept" | "decline") {
    await fetch(`/api/friends/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    router.refresh();
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">👥 Freunde</h1>
        <div className="flex gap-3 text-sm text-zinc-400">
          <Link href="/shared" className="hover:text-indigo-400">Geteilt</Link>
          <Link href="/trades" className="hover:text-indigo-400">Trades</Link>
        </div>
      </header>

      <form
        onSubmit={sendRequest}
        className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex gap-3"
      >
        <input
          type="email"
          required
          placeholder="E-Mail des Freundes"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 rounded-md bg-zinc-800 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-indigo-600 hover:bg-indigo-500 transition rounded-md px-4 py-2 font-medium disabled:opacity-50"
        >
          Anfrage senden
        </button>
      </form>
      {message && <p className="text-sm text-zinc-300">{message}</p>}

      {incoming.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium text-zinc-300">Offene Anfragen an dich</h2>
          {incoming.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-md px-4 py-2"
            >
              <span>{f.other_user_email}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => respond(f.id, "accept")}
                  className="text-emerald-400 hover:underline text-sm"
                >
                  Annehmen
                </button>
                <button
                  onClick={() => respond(f.id, "decline")}
                  className="text-red-400 hover:underline text-sm"
                >
                  Ablehnen
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {outgoing.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium text-zinc-300">Gesendete Anfragen</h2>
          {outgoing.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-md px-4 py-2 text-zinc-400"
            >
              <span>{f.other_user_email}</span>
              <span className="text-xs">Ausstehend</span>
            </div>
          ))}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="font-medium text-zinc-300">Deine Freunde</h2>
        {accepted.length === 0 ? (
          <p className="text-zinc-500 text-sm">
            Noch keine Freunde verbunden. Lade jemanden über seine E-Mail ein.
          </p>
        ) : (
          accepted.map((f) => {
            const isShared = sharedWith.includes(f.other_user_id);
            return (
              <div
                key={f.id}
                className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-md px-4 py-3"
              >
                <span>{f.other_user_email}</span>
                <button
                  onClick={() => toggleShare(f, !isShared)}
                  className={`text-xs rounded-full px-3 py-1 border transition ${
                    isShared
                      ? "bg-emerald-900/40 text-emerald-300 border-emerald-800"
                      : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-500"
                  }`}
                >
                  {isShared ? "Sammlung geteilt ✓" : "Sammlung teilen"}
                </button>
              </div>
            );
          })
        )}
      </section>
    </main>
  );
}
