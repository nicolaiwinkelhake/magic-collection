"use client";

import { useEffect, useState } from "react";
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

type Combo = {
  cards: string[];
  produces: string[];
  description: string;
  popularity: number;
};

type AlmostCombo = Combo & { missing: string[] };

type GenerateResult = {
  commander: { name: string; imageUrl: string | null; colorIdentity: string[] };
  strategy: string;
  improvementAdvice: string;
  cards: GeneratedCard[];
  combos: { included: Combo[]; almostIncluded: AlmostCombo[] } | null;
};

type CommanderOption = {
  name: string;
  imageUrl: string | null;
  colors: string[];
  hasDeck: boolean;
};

type CommanderSuggestion = {
  name: string;
  imageUrl: string | null;
  colors: string[];
  reasoning: string;
};

const CATEGORY_ORDER = ["Land", "Ramp", "Removal", "Kartenvorteil", "Wincon", "Synergie", "Sonstiges"];

export function AIDeckGeneratorClient() {
  const router = useRouter();
  const [commanderName, setCommanderName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [creating, setCreating] = useState(false);
  const [commanderOptions, setCommanderOptions] = useState<CommanderOption[] | null>(null);
  const [loadingCommanders, setLoadingCommanders] = useState(true);
  const [suggestions, setSuggestions] = useState<CommanderSuggestion[] | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ai-deck-generator/commanders")
      .then((r) => r.json())
      .then((d) => setCommanderOptions(d.commanders ?? []))
      .finally(() => setLoadingCommanders(false));
  }, []);

  async function handleSuggestCommanders() {
    setLoadingSuggestions(true);
    setSuggestionsError(null);
    setSuggestions(null);
    const res = await fetch("/api/ai-deck-generator/suggest-commanders", { method: "POST" });
    const data = await res.json();
    setLoadingSuggestions(false);
    if (!res.ok) {
      setSuggestionsError(data.error ?? "Vorschläge konnten nicht ermittelt werden");
      return;
    }
    setSuggestions(data.suggestions ?? []);
  }

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

      {!result && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm font-medium text-indigo-300">
              Unsicher, welcher Commander sich lohnt?
            </p>
            <button
              onClick={handleSuggestCommanders}
              disabled={loadingSuggestions}
              className="bg-purple-700 hover:bg-purple-600 transition rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              {loadingSuggestions ? "Analysiere Sammlung..." : "🔮 Commander vorschlagen lassen"}
            </button>
          </div>
          {suggestionsError && <p className="text-sm text-red-400">{suggestionsError}</p>}
          {suggestions && suggestions.length === 0 && (
            <p className="text-sm text-zinc-500">Keine passenden Vorschläge gefunden.</p>
          )}
          {suggestions && suggestions.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {suggestions.map((s) => (
                <button
                  key={s.name}
                  onClick={() => setCommanderName(s.name)}
                  className={`flex gap-3 text-left rounded-lg border p-3 transition ${
                    commanderName === s.name
                      ? "border-indigo-400 ring-2 ring-indigo-500/60 bg-zinc-800/50"
                      : "border-zinc-800 hover:border-indigo-500 bg-zinc-950/50"
                  }`}
                >
                  {s.imageUrl && (
                    <Image
                      src={s.imageUrl}
                      alt={s.name}
                      width={80}
                      height={112}
                      className="rounded-md shrink-0 h-fit"
                    />
                  )}
                  <div>
                    <p className="font-medium text-sm">{s.name}</p>
                    <p className="text-xs text-zinc-400 mt-1">{s.reasoning}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!result && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <p className="text-sm font-medium text-indigo-300 mb-3">
            Commander aus deiner Sammlung
          </p>
          {loadingCommanders && (
            <p className="text-sm text-zinc-500">Suche legendäre Kreaturen/Planeswalker in deiner Sammlung…</p>
          )}
          {!loadingCommanders && commanderOptions?.length === 0 && (
            <p className="text-sm text-zinc-500">
              Keine legendäre Kreatur oder Planeswalker in deiner Sammlung gefunden. Gib stattdessen einen
              Namen oben ein.
            </p>
          )}
          {!loadingCommanders && commanderOptions && commanderOptions.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
              {commanderOptions.map((c) => (
                <button
                  key={c.name}
                  onClick={() => setCommanderName(c.name)}
                  className={`relative rounded-lg overflow-hidden border text-left transition ${
                    commanderName === c.name
                      ? "border-indigo-400 ring-2 ring-indigo-500/60"
                      : "border-zinc-800 hover:border-indigo-500"
                  }`}
                >
                  {c.imageUrl ? (
                    <Image src={c.imageUrl} alt={c.name} width={244} height={340} className="w-full h-auto" />
                  ) : (
                    <div className="aspect-[244/340] flex items-center justify-center text-zinc-600 text-xs p-2 text-center bg-zinc-950">
                      {c.name}
                    </div>
                  )}
                  {c.hasDeck && (
                    <span className="absolute top-1 left-1 bg-black/70 text-[10px] rounded px-1.5 py-0.5">
                      hat schon Deck
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

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
              {result.improvementAdvice && (
                <p className="text-sm text-amber-300 bg-amber-900/20 border border-amber-800/50 rounded-md px-3 py-2">
                  {result.improvementAdvice}
                </p>
              )}
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

          {result.combos && (result.combos.included.length > 0 || result.combos.almostIncluded.length > 0) && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-indigo-300">
                🧩 Combos (verifiziert über Commander Spellbook)
              </p>

              {result.combos.included.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-zinc-500">Im Deck enthalten</p>
                  {result.combos.included.map((c) => (
                    <div
                      key={c.cards.join("+")}
                      className="bg-emerald-900/20 border border-emerald-800/50 rounded-md px-3 py-2 text-sm"
                    >
                      <p className="font-medium text-emerald-300">{c.cards.join(" + ")}</p>
                      <p className="text-xs text-zinc-400 mt-1">{c.description}</p>
                      {c.produces.length > 0 && (
                        <p className="text-xs text-zinc-500 mt-1">→ {c.produces.join(", ")}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {result.combos.almostIncluded.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-zinc-500">
                    Fast vorhanden – fehlt nur 1-2 Karten (lohnende Ergänzung für die Sammlung)
                  </p>
                  {result.combos.almostIncluded.map((c) => (
                    <div
                      key={c.cards.join("+")}
                      className="bg-amber-900/20 border border-amber-800/50 rounded-md px-3 py-2 text-sm"
                    >
                      <p className="font-medium text-amber-300">{c.cards.join(" + ")}</p>
                      <p className="text-xs text-zinc-500">
                        Fehlt: {c.missing.join(", ")}
                      </p>
                      <p className="text-xs text-zinc-400 mt-1">{c.description}</p>
                      {c.produces.length > 0 && (
                        <p className="text-xs text-zinc-500 mt-1">→ {c.produces.join(", ")}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
