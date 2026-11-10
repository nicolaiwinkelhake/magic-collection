"use client";

import { useEffect, useState } from "react";

// Anzeige der Karten: "details" = Kacheln mit schmaler Infozeile,
// "images" = nur Kartenbilder, "list" = kompakte Zeilen (Miniatur, Name,
// Set, Manakosten, Preis). Wahl wird im Browser gemerkt (gilt für Sammlung
// und Decks); Seiten ohne Listenansicht fallen auf "details" zurück.
export type CardViewMode = "details" | "images" | "list";
const KEY = "card-view";

export function useCardView(allowList = false): [CardViewMode, (m: CardViewMode) => void] {
  const [mode, setMode] = useState<CardViewMode>("details");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(KEY);
      if (saved === "details" || saved === "images") setMode(saved);
      else if (saved === "list") setMode(allowList ? "list" : "details");
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

const VIEW_ICON: Record<CardViewMode, string> = {
  list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  details: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  images: "M3 5h4v14H3zM10 5h4v14h-4zM17 5h4v14h-4z",
};
const VIEW_LABEL: Record<CardViewMode, string> = { list: "Liste", details: "Kacheln", images: "Nur Bilder" };

export function CardViewToggle({
  mode,
  onChange,
  allowList = false,
}: {
  mode: CardViewMode;
  onChange: (m: CardViewMode) => void;
  allowList?: boolean;
}) {
  const modes: CardViewMode[] = allowList ? ["list", "details", "images"] : ["details", "images"];
  return (
    <div className="flex rounded-lg bg-white/5 border border-white/10 p-0.5" role="group" aria-label="Kartenansicht">
      {modes.map((key) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          aria-pressed={mode === key}
          aria-label={VIEW_LABEL[key]}
          title={VIEW_LABEL[key]}
          className={`grid place-items-center w-8 h-7 rounded-md transition ${
            mode === key ? "bg-white/15 text-white" : "text-zinc-500 hover:text-zinc-200"
          }`}
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d={VIEW_ICON[key]} />
          </svg>
        </button>
      ))}
    </div>
  );
}

// Menge als einziges Abzeichen auf dem Bild.
export function QuantityBadge({ count }: { count: number }) {
  if (count <= 1) return null;
  return (
    <span className="absolute top-1.5 right-1.5 bg-black/80 backdrop-blur text-white text-[11px] font-semibold rounded-md px-1.5 py-0.5 tabular-nums ring-1 ring-white/10">
      ×{count}
    </span>
  );
}
