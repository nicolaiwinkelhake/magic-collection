"use client";

import { useEffect, useState } from "react";

// Anzeige der Kartenkacheln: "details" = schmale Infozeile unter dem Bild,
// "images" = nur Kartenbilder. Wahl wird im Browser gemerkt (gilt für
// Sammlung und Decks).
export type CardViewMode = "details" | "images";
const KEY = "card-view";

export function useCardView(): [CardViewMode, (m: CardViewMode) => void] {
  const [mode, setMode] = useState<CardViewMode>("details");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(KEY);
      if (saved === "details" || saved === "images") setMode(saved);
    } catch {
      // Speicher gesperrt: Standard behalten.
    }
  }, []);
  const update = (m: CardViewMode) => {
    setMode(m);
    try {
      window.localStorage.setItem(KEY, m);
    } catch {
      // ignorieren
    }
  };
  return [mode, update];
}

export function CardViewToggle({ mode, onChange }: { mode: CardViewMode; onChange: (m: CardViewMode) => void }) {
  return (
    <div className="flex rounded-md overflow-hidden border border-zinc-700 text-xs" role="group" aria-label="Kartenansicht">
      {(
        [
          ["details", "Details"],
          ["images", "Nur Bilder"],
        ] as const
      ).map(([key, label]) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          aria-pressed={mode === key}
          className={`px-2 py-1 ${mode === key ? "bg-zinc-700 text-white" : "bg-zinc-900 text-zinc-400 hover:text-zinc-200"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// Menge als einziges Abzeichen auf dem Bild.
export function QuantityBadge({ count }: { count: number }) {
  if (count <= 1) return null;
  return (
    <span className="absolute top-1 right-1 bg-black/75 text-white text-[11px] font-semibold rounded-full px-1.5 py-0.5 tabular-nums">
      ×{count}
    </span>
  );
}
