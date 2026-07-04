"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { Deck } from "@/lib/deckTypes";

export function DecksClient({ initialDecks }: { initialDecks: Deck[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [commanderName, setCommanderName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, commanderName }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error);
      return;
    }

    router.push(`/decks/${data.deck.id}`);
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">🎴 Commander Decks</h1>
        <Link href="/collection" className="text-indigo-400 hover:underline text-sm">
          Zur Sammlung
        </Link>
      </header>

      <form
        onSubmit={handleCreate}
        className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3"
      >
        <h2 className="font-medium">Neues Deck anlegen</h2>
        <div className="flex flex-wrap gap-3">
          <input
            placeholder="Deckname (z. B. 'Atraxa Superfriends')"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="flex-1 min-w-[200px] rounded-md bg-zinc-800 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            placeholder="Commander-Name (exakter Kartenname)"
            value={commanderName}
            onChange={(e) => setCommanderName(e.target.value)}
            required
            className="flex-1 min-w-[200px] rounded-md bg-zinc-800 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-500 transition rounded-md px-4 py-2 font-medium disabled:opacity-50"
          >
            {loading ? "Erstelle..." : "Deck anlegen"}
          </button>
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
      </form>

      {initialDecks.length === 0 ? (
        <p className="text-zinc-500 text-center py-12">
          Noch keine Decks angelegt.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {initialDecks.map((deck) => (
            <Link
              key={deck.id}
              href={`/decks/${deck.id}`}
              className="bg-zinc-900 border border-zinc-800 hover:border-indigo-500 rounded-lg overflow-hidden transition"
            >
              {deck.commander_image_url && (
                <Image
                  src={deck.commander_image_url}
                  alt={deck.commander_name}
                  width={244}
                  height={340}
                  className="w-full h-auto"
                />
              )}
              <div className="p-3">
                <p className="font-medium truncate">{deck.name}</p>
                <p className="text-sm text-zinc-500 truncate">
                  {deck.commander_name}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
