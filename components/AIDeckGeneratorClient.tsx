"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

type GeneratedCard = {
  name: string;
  category: string;
  type_line: string | null;
  cmc: number | null;
  colors: string[] | null;
};

type GenerateResult = {
  commander: { name: string; imageUrl: string | null; colorIdentity: string[] };
  strategy: string;
  cards: GeneratedCard[];
};

const CATEGORY_ORDER = ["Land", "Ramp", "Removal", "Kartenvorteil", "Wincon", "Synergie", "Sonstiges"];

export function AIDeckGeneratorClient() {
  const router = useRouter();
  const [commanderName, setCommanderName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [creating, setCreating] = useState(false);

  async function handleGenerate() {
    if (!commanderName.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    const res = await fetch("/api/ai-deck-generator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commanderName: commanderName.trim() }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Fehler beim Generieren");
      return;
    }
    setResult(data);
  }

  async function handleCreateDeck() {
    if (!result) return;
    setCreating(true);
    setError(null);

    const deckRes = await fetch("/api/decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `${result.commander.name} (KI-Deck)`,
        commanderName: result.commander.name,
      }),
    });
    const deckData = await deckRes.json();
    if (!deckRes.ok) {
      setCreating(false);
      setError(deckData.error ?? "Deck konnte nicht angelegt werden");
      return;
    }

    const cardsRes = await fetch(`/api/decks/${deckData.deck.id}/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nameEntries: result.cards.map((c) => ({ name: c.name, quantity: 1 })),
      }),
    });
    setCreating(false);
    if (!cardsRes.ok) {
      const cardsData = await cardsRes.json().catch(() => ({}));
      setError(cardsData.error ?? "Karten konnten nicht importiert werden");
      return;
    }

    router.push(`/decks/${deckData.deck.id}`);
    router.refresh();
  }

  const grouped = result
    ? CATEGORY_ORDER.map((cat) => ({
        category: cat,
        cards: result.cards.filter((c) => c.category === cat),
      })).filter((g) => g.cards.length > 0)
    : [];

  return (
    <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <Link href="/collection" className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-white transition">
        ← Zurück zur Sammlung
      </Link>

      <header>
        <h1 className="text-2xl font-semibold">🤖 AI Deck Generator</h1>
        <p className="text-zinc-400 mt-1">
          Gib einen Commander an – Claude baut daraus das stärkste Deck, das sich ausschließlich aus deiner
          Sammlung (und nicht bereits in anderen Decks verbauten Karten) zusammenstellen lässt.
        </p>
      </header>

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
        <label className="text-sm text-zinc-400 block">Commander-Name</label>
        <div className="flex flex-wrap gap-3">
          <input
            value={commanderName}
            onChange={(e) => setCommanderName(e.target.value)}
            placeholder="z. B. Atraxa, Praetors' Voice"
            className="flex-1 min-w-[240px] rounded-md bg-zinc-800 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={handleGenerate}
            disabled={loading || !commanderName.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 transition rounded-md px-4 py-2 font-medium disabled:opacity-50"
          >
            {loading ? "Generiere Deck..." : "Deck generieren"}
          </button>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      {result && (
        <div className="space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex gap-4 items-start">
            {result.commander.imageUrl && (
              <Image
                src={result.commander.imageUrl}
                alt={result.commander.name}
                width={100}
                height={140}
                className="rounded-md shrink-0"
              />
            )}
            <div className="space-y-2">
              <h2 className="text-lg font-medium">{result.commander.name}</h2>
              <p className="text-sm text-zinc-400">{result.strategy}</p>
              <p className="text-sm text-zinc-500">
                {result.cards.length} Karten ausgewählt (aus deiner Sammlung, aktuell frei verfügbar)
              </p>
              <button
                onClick={handleCreateDeck}
                disabled={creating}
                className="bg-emerald-700 hover:bg-emerald-600 transition rounded-md px-4 py-2 font-medium disabled:opacity-50"
              >
                {creating ? "Deck wird erstellt..." : "Deck erstellen"}
              </button>
            </div>
          </div>

          {grouped.map((group) => (
            <div key={group.category}>
              <p className="text-sm font-medium text-indigo-300 mb-2">
                {group.category} ({group.cards.length})
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {group.cards.map((c) => (
                  <div
                    key={c.name}
                    className="bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1.5 text-xs text-zinc-300"
                  >
                    {c.name}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
