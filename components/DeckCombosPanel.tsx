"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Combo = { cards: string[]; produces: string[]; description: string };
type Result = {
  available: boolean;
  included: Combo[];
  almost: Array<Combo & { missing: string[]; missingOwned: number }>;
  comparable: number;
  staples: Array<{ name: string; decks: number; owned: number }>;
};

// Combos im Deck, "eine Karte fehlt" und Karten aus vergleichbaren Decks der
// Gruppe – auf Klick geladen (externe API, kann ein paar Sekunden dauern).
export function DeckCombosPanel({ deckId }: { deckId: string }) {
  const router = useRouter();
  const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/decks/${deckId}/combos`).catch(() => null);
    const d = await res?.json().catch(() => null);
    setLoading(false);
    if (!res?.ok || !d) setError(d?.error ?? "Konnte nicht geladen werden.");
    else setData(d);
  }

  async function add(name: string, owned: boolean) {
    const res = owned
      ? await fetch(`/api/decks/${deckId}/cards`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ names: [name], addToCollection: false }),
        })
      : await fetch("/api/wishlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ names: name }),
        });
    setNotice(res.ok ? (owned ? `„${name}“ ins Deck gelegt.` : `„${name}“ auf die Wunschliste gesetzt.`) : `Fehler ${res.status}`);
    if (res.ok && owned) router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-lg">Combos & Gruppenvergleich</h2>
        <button
          onClick={load}
          disabled={loading}
          className="bg-indigo-600 hover:bg-indigo-500 transition rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          {loading ? "Lade…" : data ? "Neu laden" : "Laden"}
        </button>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {notice && <p className="text-sm text-emerald-300">{notice}</p>}

      {data && (
        <>
          {!data.available && <p className="text-sm text-amber-400">Commander Spellbook ist gerade nicht erreichbar.</p>}
          <section className="space-y-1">
            <h3 className="font-medium">Combos im Deck ({data.included.length})</h3>
            {data.included.length === 0 ? (
              <p className="text-sm text-zinc-500">Keine bekannten Combos.</p>
            ) : (
              <ul className="text-sm space-y-1">
                {data.included.map((c) => (
                  <li key={c.cards.join("|")}>
                    {c.cards.join(" + ")} <span className="text-zinc-500">→ {c.produces.slice(0, 2).join(", ")}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {data.almost.length > 0 && (
            <section className="space-y-1">
              <h3 className="font-medium">Nur eine Karte fehlt</h3>
              <ul className="text-sm space-y-1">
                {data.almost.map((c) => (
                  <li key={c.cards.join("|")} className="flex flex-wrap items-baseline gap-x-2">
                    <span>
                      {c.cards.map((n) => (c.missing.includes(n) ? <strong key={n} className="text-amber-300">{n}</strong> : n)).reduce<React.ReactNode[]>((acc, el, i) => (i ? [...acc, " + ", el] : [el]), [])}
                    </span>
                    <span className="text-zinc-500">→ {c.produces.slice(0, 2).join(", ")}</span>
                    <button onClick={() => add(c.missing[0], c.missingOwned > 0)} className="text-indigo-400 hover:underline">
                      {c.missingOwned > 0 ? "+ Deck (besitzt du)" : "+ Wunschliste"}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="space-y-1">
            <h3 className="font-medium">Häufig in vergleichbaren Decks eurer Gruppe</h3>
            {data.comparable === 0 ? (
              <p className="text-sm text-zinc-500">
                Keine vergleichbaren Decks (gleicher Commander oder gleiche Farben) bei dir oder deinen Freunden.
              </p>
            ) : (
              <ul className="text-sm space-y-1">
                {data.staples.map((s) => (
                  <li key={s.name} className="flex items-baseline gap-2">
                    <span>{s.name}</span>
                    <span className="text-zinc-500">
                      in {s.decks} von {data.comparable} Decks
                    </span>
                    <button onClick={() => add(s.name, s.owned > 0)} className="text-indigo-400 hover:underline">
                      {s.owned > 0 ? "+ Deck" : "+ Wunschliste"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
