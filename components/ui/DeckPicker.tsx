"use client";

import { useEffect, useState } from "react";

// Karten aus der Sammlung in ein Deck legen: Deck wählen, fertig.
// Die Karten liegen schon in der Sammlung – sie werden nur dem Deck
// zugeordnet (mit Druck und Foil), nicht ein zweites Mal gezählt.

export type DeckOption = { id: string; name: string };
export type PickCard = { id: string; name: string; scryfall_id: string; set_code: string | null; collector_number: string | null; foil: boolean };

export function DeckPicker({
  decks,
  cards,
  inDecks,
  onDone,
  onClose,
}: {
  decks: DeckOption[];
  cards: PickCard[];
  /** Deck-IDs, in denen die (erste) Karte schon steckt – zur Anzeige */
  inDecks?: Set<string>;
  onDone: (deck: DeckOption, added: number) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function pick(deck: DeckOption) {
    if (busy) return;
    setBusy(deck.id);
    setError(null);
    const res = await fetch(`/api/decks/${deck.id}/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        addToCollection: false,
        entries: cards.map((c) => ({
          name: c.name,
          scryfallId: c.scryfall_id,
          set: c.set_code ?? undefined,
          collectorNumber: c.collector_number ?? undefined,
          foil: c.foil,
          quantity: 1,
        })),
      }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      setError((data?.error as string | undefined) ?? "Konnte nicht ins Deck gelegt werden – bitte erneut versuchen.");
      return;
    }
    onDone(deck, (data?.inserted as number | undefined) ?? cards.length);
  }

  const title = cards.length === 1 ? cards[0].name : `${cards.length} Karten`;
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/75" onClick={() => !busy && onClose()} role="dialog" aria-modal="true" aria-label="In Deck legen">
      <div
        className="w-full sm:max-w-md max-h-[80dvh] flex flex-col rounded-t-[2rem] sm:rounded-3xl bg-zinc-900 border border-white/10 pb-[env(safe-area-inset-bottom)] animate-[sheet_280ms_cubic-bezier(.2,.8,.2,1)] sm:animate-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 p-4 pb-3 border-b border-white/5">
          <div className="min-w-0">
            <h2 className="font-semibold">In Deck legen</h2>
            <p className="text-xs text-zinc-500 truncate">{title} · bleibt in der Sammlung</p>
          </div>
          <button onClick={onClose} disabled={!!busy} aria-label="Schließen" className="shrink-0 w-9 h-9 rounded-full bg-white/10 disabled:opacity-50">
            ✕
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain p-3 space-y-1.5">
          {error && <p className="px-1 text-sm text-red-400">{error}</p>}
          {decks.length === 0 ? (
            <p className="px-1 py-2 text-sm text-zinc-400">
              Noch keine Decks. <a href="/decks" className="text-indigo-300 underline">Deck anlegen</a>
            </p>
          ) : (
            decks.map((d) => (
              <button
                key={d.id}
                onClick={() => void pick(d)}
                disabled={!!busy}
                className="press w-full flex items-center justify-between gap-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.08] px-3 py-3 text-left disabled:opacity-60"
              >
                <span className="min-w-0 truncate font-medium">{d.name}</span>
                <span className="shrink-0 text-xs text-zinc-400">
                  {busy === d.id ? "Lege hinein …" : inDecks?.has(d.id) ? "schon drin · noch eine" : "+"}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
