"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatEur } from "@/lib/format";

type Swap = { out: string; in: string; reason: string; outCardId: string | null; inOwned: boolean; inEur: number | null };
type Result = { summary: string; swaps: Swap[]; cuts: Array<{ name: string; reason: string; cardId: string | null }> };

// Deck-Coach: konkrete Tauschvorschläge von Claude aus geprüften Kandidaten.
export function DeckCoachPanel({ deckId }: { deckId: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"collection" | "budget" | "best">("collection");
  const [budget, setBudget] = useState(5);
  const [bracket, setBracket] = useState<number | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});

  async function ask() {
    setLoading(true);
    setError(null);
    setResult(null);
    setDone({});
    const res = await fetch(`/api/decks/${deckId}/coach`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, budget: mode === "budget" ? budget : undefined, targetBracket: bracket ?? undefined }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setLoading(false);
    if (!res?.ok || !data) setError(data?.error ?? "Der Coach ist gerade nicht erreichbar.");
    else setResult(data);
  }

  // Tausch ausführen: alte Karte aus dem Deck (bleibt in der Sammlung), neue
  // ins Deck (ohne Sammlung zu verändern); fehlt sie, zusätzlich Wunschliste.
  async function applySwap(s: Swap) {
    setDone((d) => ({ ...d, [s.in]: "…" }));
    if (s.outCardId) {
      const del = await fetch(`/api/decks/${deckId}/cards`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: s.outCardId }),
      });
      if (!del.ok) {
        setDone((d) => ({ ...d, [s.in]: `Fehler beim Entfernen (${del.status})` }));
        return;
      }
    }
    const add = await fetch(`/api/decks/${deckId}/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ names: [s.in], addToCollection: false }),
    });
    if (!add.ok) {
      setDone((d) => ({ ...d, [s.in]: `Fehler beim Hinzufügen (${add.status})` }));
      return;
    }
    if (!s.inOwned) {
      await fetch("/api/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names: s.in }),
      });
    }
    setDone((d) => ({ ...d, [s.in]: s.inOwned ? "✔ getauscht" : "✔ getauscht, auf Wunschliste" }));
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-medium text-lg">🧠 Deck-Coach</h2>
        <span className="text-xs text-zinc-500">Vorschläge von Claude, nur aus geprüften Kandidaten</span>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <div className="flex rounded overflow-hidden border border-zinc-700" role="group" aria-label="Modus">
          {(
            [
              ["collection", "Nur aus meiner Sammlung"],
              ["budget", "Budget-Upgrade"],
              ["best", "Beste Upgrades"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              className={`px-2 py-1 ${mode === key ? "bg-indigo-600" : "bg-zinc-800 hover:bg-zinc-700"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {mode === "budget" && (
          <label className="flex items-center gap-2">
            bis
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              className="w-20 rounded bg-zinc-800 px-2 py-1"
            />
            € je Karte
          </label>
        )}
        <label className="flex items-center gap-2">
          Ziel-Bracket
          <select
            value={bracket ?? ""}
            onChange={(e) => setBracket(e.target.value ? Number(e.target.value) : null)}
            className="rounded bg-zinc-800 px-2 py-1"
          >
            <option value="">egal</option>
            <option value="2">2 – Core</option>
            <option value="3">3 – Upgraded</option>
            <option value="4">4 – Optimized</option>
          </select>
        </label>
        <button
          onClick={ask}
          disabled={loading}
          className="bg-indigo-600 hover:bg-indigo-500 rounded-md px-3 py-1.5 font-medium disabled:opacity-50"
        >
          {loading ? "Coach denkt nach…" : "Vorschläge holen"}
        </button>
      </div>
      {loading && <p className="text-xs text-zinc-500">Das dauert meist 20–60 Sekunden.</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {result && (
        <div className="space-y-3">
          <p className="text-sm text-zinc-300">{result.summary}</p>
          {result.swaps.length > 0 && (
            <ul className="space-y-2">
              {result.swaps.map((s) => (
                <li key={s.in} className="rounded-md bg-zinc-800/60 px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span>
                      <span className="text-red-300">− {s.out}</span>
                      {"  →  "}
                      <span className="text-emerald-300">+ {s.in}</span>
                      <span className="text-xs text-zinc-500">
                        {" "}
                        {s.inOwned ? "(besitzt du)" : s.inEur !== null ? `(${formatEur(s.inEur)})` : ""}
                      </span>
                    </span>
                    {done[s.in] ? (
                      <span className="text-xs text-zinc-400">{done[s.in]}</span>
                    ) : (
                      <button onClick={() => applySwap(s)} className="text-indigo-400 hover:underline text-xs">
                        Tauschen
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400">{s.reason}</p>
                </li>
              ))}
            </ul>
          )}
          {result.cuts.length > 0 && (
            <div className="space-y-1">
              <h3 className="text-sm font-medium">Weitere Streichkandidaten</h3>
              <ul className="text-xs text-zinc-400 space-y-0.5">
                {result.cuts.map((c) => (
                  <li key={c.name}>
                    <span className="text-zinc-200">{c.name}</span> – {c.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
