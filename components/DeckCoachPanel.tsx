"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatEur } from "@/lib/format";

type Swap = { out: string; in: string; reason: string; inOwned: boolean; inEur: number | null };
type CoachResult = {
  summary: string;
  swaps: Swap[];
  cuts: Array<{ name: string; reason: string }>;
  applied?: string[];
};
type Params = { mode: "collection" | "budget" | "best"; budget: number | null; targetBracket: number | null };
type Entry = { id: string | null; createdAt: string; params: Params; result: CoachResult };

const MODE_LABEL: Record<Params["mode"], string> = {
  collection: "Nur aus meiner Sammlung",
  budget: "Budget-Upgrade",
  best: "Beste Upgrades",
};

function describeParams(p: Params): string {
  const parts = [MODE_LABEL[p.mode]];
  if (p.mode === "budget" && p.budget) parts.push(`bis ${formatEur(p.budget)} je Karte`);
  if (p.targetBracket) parts.push(`Ziel-Bracket ${p.targetBracket}`);
  return parts.join(", ");
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
}

// Deck-Coach: Vorschläge von Claude. Jede Abfrage kostet Geld und wird
// gespeichert – beim Öffnen erscheint die letzte, ältere sind auswählbar.
export function DeckCoachPanel({
  deckId,
  deckCards,
}: {
  deckId: string;
  deckCards: Array<{ id: string; name: string; is_commander: boolean }>;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Params["mode"]>("collection");
  const [budget, setBudget] = useState(5);
  const [bracket, setBracket] = useState<number | null>(null);
  const [history, setHistory] = useState<Entry[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Record<string, string>>({});
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    fetch(`/api/decks/${deckId}/coach`)
      .then((r) => (r.ok ? r.json() : { history: [] }))
      .then((d) => {
        const list = (d.history ?? []) as Entry[];
        setHistory(list);
        setSelectedId(list[0]?.id ?? null);
        setShowForm(list.length === 0);
      })
      .catch(() => setHistory([]));
  }, [deckId]);

  const entry = history?.find((e) => e.id === selectedId) ?? history?.[0] ?? null;
  const applied = new Set(entry?.result.applied ?? []);

  async function ask() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/decks/${deckId}/coach`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, budget: mode === "budget" ? budget : undefined, targetBracket: bracket ?? undefined }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setLoading(false);
    if (!res?.ok || !data) {
      setError(data?.error ?? "Der Coach ist gerade nicht erreichbar.");
      return;
    }
    if (!data.result) {
      // Keine Kandidaten → keine kostenpflichtige Abfrage, nur Hinweis.
      setError(data.summary ?? "Keine passenden Kandidaten.");
      return;
    }
    const newEntry = data as Entry;
    setHistory((h) => [newEntry, ...(h ?? [])]);
    setSelectedId(newEntry.id);
    setShowForm(false);
    setStatus({});
  }

  async function saveApplied(next: string[]) {
    if (!entry?.id) return;
    setHistory((h) => (h ?? []).map((e) => (e.id === entry.id ? { ...e, result: { ...e.result, applied: next } } : e)));
    await fetch(`/api/ai-results/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applied: next }),
    }).catch(() => {});
  }

  // Tausch ausführen: alte Karte aus dem Deck (bleibt in der Sammlung), neue
  // ins Deck (ohne Sammlung zu verändern); fehlt sie, zusätzlich Wunschliste.
  async function applySwap(s: Swap) {
    setStatus((st) => ({ ...st, [s.in]: "…" }));
    const outCard = deckCards.find((c) => c.name === s.out && !c.is_commander);
    if (outCard) {
      const del = await fetch(`/api/decks/${deckId}/cards`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: outCard.id }),
      });
      if (!del.ok) {
        setStatus((st) => ({ ...st, [s.in]: `Fehler beim Entfernen (${del.status})` }));
        return;
      }
    }
    const add = await fetch(`/api/decks/${deckId}/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ names: [s.in], addToCollection: false }),
    });
    if (!add.ok) {
      setStatus((st) => ({ ...st, [s.in]: `Fehler beim Hinzufügen (${add.status})` }));
      return;
    }
    if (!s.inOwned) {
      await fetch("/api/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names: s.in }),
      });
    }
    setStatus((st) => ({ ...st, [s.in]: s.inOwned ? "" : "auf Wunschliste" }));
    await saveApplied([...applied, s.in]);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-medium text-lg">🧠 Deck-Coach</h2>
        {history && history.length > 0 && !showForm && (
          <button onClick={() => setShowForm(true)} className="text-sm text-indigo-400 hover:underline">
            Neue Abfrage …
          </button>
        )}
      </div>

      {showForm && (
        <div className="space-y-2 rounded-md border border-zinc-800 p-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <div className="flex rounded overflow-hidden border border-zinc-700" role="group" aria-label="Modus">
              {(Object.keys(MODE_LABEL) as Params["mode"][]).map((key) => (
                <button
                  key={key}
                  onClick={() => setMode(key)}
                  className={`px-2 py-1 ${mode === key ? "bg-indigo-600" : "bg-zinc-800 hover:bg-zinc-700"}`}
                >
                  {MODE_LABEL[key]}
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
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={ask}
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-500 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              {loading ? "Coach denkt nach…" : "Vorschläge holen"}
            </button>
            {history && history.length > 0 && !loading && (
              <button onClick={() => setShowForm(false)} className="text-sm text-zinc-400 hover:underline">
                Abbrechen
              </button>
            )}
            <span className="text-xs text-zinc-500">
              {loading ? "Dauert meist 20–60 Sekunden." : "Kostenpflichtige Claude-Abfrage – das Ergebnis wird gespeichert."}
            </span>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
      {history === null && <p className="text-sm text-zinc-500">Lade gespeicherte Abfragen…</p>}

      {entry && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-400">
            <span>
              Auf Basis der Abfrage vom <strong className="text-zinc-200">{formatDateTime(entry.createdAt)}</strong> (
              {describeParams(entry.params)}):
            </span>
            {history && history.length > 1 && (
              <select
                value={entry.id ?? ""}
                onChange={(e) => setSelectedId(e.target.value)}
                className="rounded bg-zinc-800 px-2 py-1 text-xs"
                aria-label="Frühere Abfrage wählen"
              >
                {history.map((h, i) => (
                  <option key={h.id ?? i} value={h.id ?? ""}>
                    {formatDateTime(h.createdAt)} – {MODE_LABEL[h.params.mode]}
                  </option>
                ))}
              </select>
            )}
          </div>
          <p className="text-sm text-zinc-300">{entry.result.summary}</p>
          {entry.result.swaps.length > 0 && (
            <ul className="space-y-2">
              {entry.result.swaps.map((s) => {
                const isApplied = applied.has(s.in);
                return (
                  <li key={s.in} className={`rounded-md px-3 py-2 text-sm ${isApplied ? "bg-emerald-950/40" : "bg-zinc-800/60"}`}>
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
                      {isApplied ? (
                        <span className="text-xs text-emerald-400">✔ übernommen {status[s.in] ? `· ${status[s.in]}` : ""}</span>
                      ) : status[s.in] ? (
                        <span className="text-xs text-zinc-400">{status[s.in]}</span>
                      ) : (
                        <button onClick={() => applySwap(s)} className="text-indigo-400 hover:underline text-xs">
                          Tauschen
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-zinc-400">{s.reason}</p>
                  </li>
                );
              })}
            </ul>
          )}
          {entry.result.cuts.length > 0 && (
            <div className="space-y-1">
              <h3 className="text-sm font-medium">Weitere Streichkandidaten</h3>
              <ul className="text-xs text-zinc-400 space-y-0.5">
                {entry.result.cuts.map((c) => (
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
