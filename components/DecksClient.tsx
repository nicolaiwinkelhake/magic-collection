"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { Deck } from "@/lib/deckTypes";
import { ColorIdentity } from "@/components/ui/Mana";

// Scryfall liefert zu jedem Bild auch einen reinen Artwork-Ausschnitt.
const artCrop = (url: string) => url.replace("/normal/", "/art_crop/").replace("/large/", "/art_crop/");

export function DecksClient({ initialDecks }: { initialDecks: Deck[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [commanderName, setCommanderName] = useState("");
  const [partnerName, setPartnerName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(initialDecks.length === 0);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, commanderName, partnerName: partnerName.trim() || undefined }),
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
    <main className="max-w-6xl mx-auto px-4 py-5 sm:py-8 space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Decks</h1>
          <p className="text-sm text-zinc-500">{initialDecks.length} Commander-Decks</p>
        </div>
        <button
          onClick={() => setFormOpen((v) => !v)}
          aria-expanded={formOpen}
          className="flex items-center gap-2 rounded-full bg-indigo-500 hover:bg-indigo-400 transition px-4 h-10 text-sm font-medium shadow-lg shadow-indigo-950/50"
        >
          <span className="text-lg leading-none" aria-hidden>{formOpen ? "×" : "+"}</span>
          Neues Deck
        </button>
      </header>

      {formOpen && (
        <form
          onSubmit={handleCreate}
          className="rounded-2xl border border-white/10 bg-zinc-900/80 p-4 space-y-3"
        >
          <h2 className="font-medium">Neues Deck anlegen</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <input
              placeholder="Deckname (z. B. 'Atraxa Superfriends')"
              aria-label="Deckname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="h-11 rounded-xl bg-white/5 border border-white/10 px-3 outline-none focus:border-indigo-400/70"
            />
            <input
              placeholder="Commander (exakter Kartenname)"
              aria-label="Commander"
              value={commanderName}
              onChange={(e) => setCommanderName(e.target.value)}
              required
              className="h-11 rounded-xl bg-white/5 border border-white/10 px-3 outline-none focus:border-indigo-400/70"
            />
            <input
              placeholder="Partner / Background (optional)"
              aria-label="Partner oder Background"
              value={partnerName}
              onChange={(e) => setPartnerName(e.target.value)}
              className="h-11 rounded-xl bg-white/5 border border-white/10 px-3 outline-none focus:border-indigo-400/70"
            />
            <button
              type="submit"
              disabled={loading}
              className="h-11 bg-indigo-500 hover:bg-indigo-400 transition rounded-xl px-4 font-medium disabled:opacity-50"
            >
              {loading ? "Erstelle..." : "Deck anlegen"}
            </button>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
        </form>
      )}

      {initialDecks.length === 0 ? (
        <p className="text-zinc-500 text-center py-12">
          Noch keine Decks angelegt.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {initialDecks.map((deck) => (
            <Link
              key={deck.id}
              href={`/decks/${deck.id}`}
              className="group relative block h-36 sm:h-44 rounded-2xl overflow-hidden border border-white/10 bg-zinc-900 transition hover:border-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              {deck.commander_image_url && (
                <Image
                  src={artCrop(deck.commander_image_url)}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                  className="object-cover object-[center_25%] transition duration-500 group-hover:scale-105"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-black/0" aria-hidden />
              <div className="absolute top-3 right-3 rounded-full bg-black/50 backdrop-blur px-1.5 py-1">
                <ColorIdentity colors={deck.color_identity} />
              </div>
              <div className="absolute inset-x-0 bottom-0 p-4">
                <p className="font-semibold text-lg leading-tight truncate drop-shadow">{deck.name}</p>
                <p className="text-sm text-zinc-300 truncate">
                  {deck.commander_name}
                  {deck.partner_name && ` + ${deck.partner_name}`}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
