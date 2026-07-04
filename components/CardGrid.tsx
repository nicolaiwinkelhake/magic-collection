"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { formatEur } from "@/lib/format";
import { cardValue } from "@/lib/valuation";
import { EmptyState } from "@/components/ui/States";
import type { Card } from "@/lib/types";

export function CardGrid({ cards }: { cards: Card[] }) {
  const router = useRouter();

  // Optimistische lokale Kopie: Änderungen sofort anzeigen, Server folgt.
  const [local, setLocal] = useState<Card[]>(cards);
  useEffect(() => setLocal(cards), [cards]);

  const [editing, setEditing] = useState<Card | null>(null);
  const [preview, setPreview] = useState<Card | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Mehrfachauswahl (Bulk-Aktionen)
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function revert(message: string) {
    setLocal(cards);
    setErrorMsg(message);
    router.refresh();
  }

  async function patch(card: Card, changes: Partial<Card>) {
    const next = { ...card, ...changes };
    const removing = (changes.quantity ?? next.quantity) <= 0;

    // 1) Sofort lokal anwenden (optimistisch)
    setLocal((prev) =>
      removing
        ? prev.filter((c) => c.id !== card.id)
        : prev.map((c) => (c.id === card.id ? next : c))
    );
    setEditing(removing ? null : next);
    setErrorMsg(null);

    // 2) Server nachziehen; bei Fehler zurückrollen
    const res = await fetch("/api/cards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: card.id, ...changes }),
    });
    if (!res.ok) {
      revert("Änderung konnte nicht gespeichert werden – Stand zurückgesetzt.");
      return;
    }
    router.refresh();
  }

  async function removeCards(ids: string[]) {
    setBusy(true);
    setErrorMsg(null);
    setLocal((prev) => prev.filter((c) => !ids.includes(c.id)));
    setEditing(null);
    setSelected(new Set());
    setSelectMode(false);

    const res = await fetch("/api/cards", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    setBusy(false);
    if (!res.ok) {
      revert("Löschen fehlgeschlagen – Stand zurückgesetzt.");
      return;
    }
    router.refresh();
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (!local.length) {
    return (
      <EmptyState
        icon="🔍"
        title="Keine Karten gefunden"
        hint="Importiere welche oder ändere die Filter."
      />
    );
  }

  return (
    <>
      {/* Bulk-Leiste */}
      <div className="flex items-center justify-between mb-3 min-h-[32px]">
        <div aria-live="polite">
          {errorMsg && <p className="text-sm text-red-400">{errorMsg}</p>}
        </div>
        <div className="flex items-center gap-3">
          {selectMode && selected.size > 0 && (
            <button
              onClick={() => removeCards([...selected])}
              disabled={busy}
              className="bg-red-700 hover:bg-red-600 transition rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              {selected.size} löschen
            </button>
          )}
          <button
            onClick={() => {
              setSelectMode((v) => !v);
              setSelected(new Set());
            }}
            className="text-sm text-indigo-400 hover:underline"
          >
            {selectMode ? "Auswahl beenden" : "Auswählen"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {local.map((card) => {
          const isSelected = selected.has(card.id);
          return (
            <button
              key={card.id}
              onClick={() =>
                selectMode ? toggleSelected(card.id) : setEditing(card)
              }
              aria-label={
                selectMode
                  ? `${card.name} ${isSelected ? "abwählen" : "auswählen"}`
                  : `${card.name} bearbeiten`
              }
              aria-pressed={selectMode ? isSelected : undefined}
              className={`group relative rounded-lg overflow-hidden bg-zinc-900 border transition text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                isSelected
                  ? "border-indigo-400 ring-2 ring-indigo-500/60"
                  : "border-zinc-800 hover:border-indigo-500"
              }`}
            >
              {card.image_url ? (
                <Image
                  src={card.image_url}
                  alt={card.name}
                  width={244}
                  height={340}
                  className="w-full h-auto"
                />
              ) : (
                <div className="aspect-[244/340] flex items-center justify-center text-zinc-600 text-sm p-2 text-center">
                  {card.name}
                </div>
              )}
              {selectMode && (
                <span
                  aria-hidden="true"
                  className={`absolute top-1 left-1 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold ${
                    isSelected
                      ? "bg-indigo-500 border-indigo-300 text-white"
                      : "bg-black/50 border-zinc-500 text-transparent"
                  }`}
                >
                  ✓
                </span>
              )}
              {card.quantity > 1 && (
                <span className="absolute top-1 right-1 bg-indigo-600 text-xs rounded-full px-2 py-0.5">
                  ×{card.quantity}
                </span>
              )}
              {!selectMode && card.foil && (
                <span className="absolute top-1 left-1 bg-gradient-to-r from-fuchsia-500 to-cyan-400 text-[10px] rounded-full px-2 py-0.5 font-semibold">
                  Foil
                </span>
              )}
              {card.condition && card.condition !== "NM" && (
                <span className="absolute bottom-7 right-1 bg-amber-700/90 text-[10px] rounded px-1.5 py-0.5">
                  {card.condition}
                </span>
              )}
              <div className="absolute bottom-0 inset-x-0 bg-black/70 text-xs px-2 py-1 flex justify-between">
                <span>{formatEur(cardValue({ ...card, quantity: 1 }))}</span>
                {card.quantity > 1 && (
                  <span className="text-zinc-400">Σ {formatEur(cardValue(card))}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Editor-Overlay */}
      {editing && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${editing.name} bearbeiten`}
          className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4"
          onClick={() => !busy && setEditing(null)}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 w-full max-w-sm space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              {editing.image_url && (
                <button
                  onClick={() => setPreview(editing)}
                  aria-label={`${editing.name} groß anzeigen`}
                  className="focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded-md"
                >
                  <Image
                    src={editing.image_url}
                    alt={editing.name}
                    width={72}
                    height={100}
                    className="rounded-md"
                  />
                </button>
              )}
              <div>
                <p className="font-medium">{editing.name}</p>
                <p className="text-xs text-zinc-500">
                  {editing.set_code?.toUpperCase()} ·{" "}
                  {formatEur(cardValue({ ...editing, quantity: 1 }))}
                  {editing.condition !== "NM" && (
                    <span className="text-amber-400"> (zustandsbereinigt)</span>
                  )}
                </p>
                {editing.image_url && (
                  <p className="text-[11px] text-zinc-600 mt-1">
                    Bild antippen für Großansicht
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-400">Menge</span>
              <div className="flex items-center gap-3">
                <button
                  disabled={busy}
                  onClick={() => patch(editing, { quantity: editing.quantity - 1 })}
                  aria-label="Menge verringern"
                  className="w-8 h-8 rounded-md bg-zinc-800 text-lg disabled:opacity-50"
                >
                  −
                </button>
                <span className="w-6 text-center" aria-live="polite">
                  {editing.quantity}
                </span>
                <button
                  disabled={busy}
                  onClick={() => patch(editing, { quantity: editing.quantity + 1 })}
                  aria-label="Menge erhöhen"
                  className="w-8 h-8 rounded-md bg-zinc-800 text-lg disabled:opacity-50"
                >
                  +
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-400">Foil</span>
              <button
                disabled={busy}
                onClick={() => patch(editing, { foil: !editing.foil })}
                className={`text-xs rounded-full px-3 py-1 border transition ${
                  editing.foil
                    ? "bg-emerald-900/40 text-emerald-300 border-emerald-800"
                    : "bg-zinc-800 text-zinc-400 border-zinc-700"
                }`}
              >
                {editing.foil ? "Foil ✓" : "Als Foil markieren"}
              </button>
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm text-zinc-400" htmlFor="cond">
                Zustand
              </label>
              <select
                id="cond"
                disabled={busy}
                value={editing.condition}
                onChange={(e) => patch(editing, { condition: e.target.value })}
                className="rounded-md bg-zinc-800 px-2 py-1.5 text-sm outline-none"
              >
                <option value="NM">Near Mint (NM)</option>
                <option value="LP">Lightly Played (LP)</option>
                <option value="MP">Moderately Played (MP)</option>
                <option value="HP">Heavily Played (HP)</option>
                <option value="DMG">Damaged (DMG)</option>
              </select>
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm text-zinc-400" htmlFor="lang">
                Sprache
              </label>
              <select
                id="lang"
                disabled={busy}
                value={editing.language}
                onChange={(e) => patch(editing, { language: e.target.value })}
                className="rounded-md bg-zinc-800 px-2 py-1.5 text-sm outline-none"
              >
                <option value="EN">Englisch (EN)</option>
                <option value="DE">Deutsch (DE)</option>
                <option value="FR">Französisch (FR)</option>
                <option value="IT">Italienisch (IT)</option>
                <option value="ES">Spanisch (ES)</option>
                <option value="JA">Japanisch (JA)</option>
              </select>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
              <button
                disabled={busy}
                onClick={() => removeCards([editing.id])}
                className="text-red-400 hover:underline text-sm disabled:opacity-50"
              >
                Aus Sammlung entfernen
              </button>
              <button
                onClick={() => setEditing(null)}
                className="text-zinc-400 hover:underline text-sm"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Großansicht (Kartenvorschau) */}
      {preview && preview.image_url && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Großansicht: ${preview.name}`}
          className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-6"
          onClick={() => setPreview(null)}
        >
          <div className="max-w-xs w-full">
            <Image
              src={preview.image_url.replace("/normal/", "/large/")}
              alt={preview.name}
              width={488}
              height={680}
              className="w-full h-auto rounded-xl shadow-2xl"
            />
            <p className="text-center text-sm text-zinc-400 mt-3">
              Tippen zum Schließen
            </p>
          </div>
        </div>
      )}
    </>
  );
}
