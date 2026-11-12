"use client";

import { useState } from "react";
import { ManaPip } from "@/components/ui/Mana";
import { GROUP_LABEL, type GroupKey } from "@/lib/collectionGroups";

const COLOR_OPTIONS = [
  { code: "W", label: "Weiß" },
  { code: "U", label: "Blau" },
  { code: "B", label: "Schwarz" },
  { code: "R", label: "Rot" },
  { code: "G", label: "Grün" },
];

const RARITIES = [
  { value: "common", label: "Common" },
  { value: "uncommon", label: "Uncommon" },
  { value: "rare", label: "Rare" },
  { value: "mythic", label: "Mythic" },
];

export type SortKey = "name" | "cmc" | "price" | "set" | "color";

export type FilterState = {
  search: string;
  colors: string[];
  rarity: string;
  type: string;
  set: string;
  sort: SortKey;
  group: GroupKey;
};

// Suchleiste mit Lupe, darunter eine wischbare Chip-Leiste (Farben als
// Mana-Pips, Seltenheit, Sortierung). Set- und Typfilter liegen hinter
// "Filter", damit die Leiste auf dem Handy kompakt bleibt.
export function Filters({
  state,
  onChange,
  sets,
}: {
  state: FilterState;
  onChange: (next: FilterState) => void;
  sets: string[];
}) {
  const [moreOpen, setMoreOpen] = useState(false);

  function toggleColor(code: string) {
    const colors = state.colors.includes(code)
      ? state.colors.filter((c) => c !== code)
      : [...state.colors, code];
    onChange({ ...state, colors });
  }

  const extraActive = (state.set ? 1 : 0) + (state.type ? 1 : 0);
  const anyActive = state.search || state.colors.length || state.rarity || extraActive;

  const chip = (active: boolean) =>
    `shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 h-8 text-xs font-medium transition ${
      active
        ? "bg-indigo-500/20 border-indigo-400/60 text-white"
        : "bg-white/5 border-white/10 text-zinc-300 hover:border-white/20"
    }`;

  return (
    <div className="space-y-3">
      <div className="relative">
        <svg
          viewBox="0 0 24 24"
          className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          type="search"
          placeholder="Karte suchen (deutsch oder englisch)"
          aria-label="Kartenname suchen"
          value={state.search}
          onChange={(e) => onChange({ ...state, search: e.target.value })}
          className="w-full h-11 rounded-xl bg-white/5 border border-white/10 pl-10 pr-3 outline-none placeholder:text-zinc-500 focus:border-indigo-400/70 focus:bg-white/[0.07] transition"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="shrink-0 flex items-center gap-1 rounded-full bg-white/5 border border-white/10 p-1" role="group" aria-label="Farben">
          {COLOR_OPTIONS.map((c) => {
            const on = state.colors.includes(c.code);
            return (
              <button
                key={c.code}
                type="button"
                onClick={() => toggleColor(c.code)}
                aria-pressed={on}
                aria-label={c.label}
                title={c.label}
                className={`rounded-full p-0.5 transition ${on ? "ring-2 ring-white scale-110" : "opacity-50 hover:opacity-90"}`}
              >
                <ManaPip symbol={c.code} size="sm" title={c.label} />
              </button>
            );
          })}
        </div>

        {RARITIES.map((r) => (
          <button
            key={r.value}
            type="button"
            onClick={() => onChange({ ...state, rarity: state.rarity === r.value ? "" : r.value })}
            aria-pressed={state.rarity === r.value}
            className={chip(state.rarity === r.value)}
          >
            {r.label}
          </button>
        ))}

        <button type="button" onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen} className={chip(extraActive > 0)}>
          Filter{extraActive > 0 && <span className="rounded-full bg-indigo-400 text-[10px] text-zinc-950 px-1.5">{extraActive}</span>}
        </button>

        <label className="shrink-0 relative">
          <span className="sr-only">Sortierung</span>
          <select
            value={state.sort}
            onChange={(e) => onChange({ ...state, sort: e.target.value as SortKey })}
            className="appearance-none h-8 rounded-full bg-white/5 border border-white/10 pl-3 pr-7 text-xs font-medium text-zinc-300 outline-none"
          >
            <option value="color">Sortieren: Farbe</option>
            <option value="name">Sortieren: Name</option>
            <option value="cmc">Sortieren: Manawert</option>
            <option value="price">Sortieren: Preis</option>
            <option value="set">Sortieren: Set</option>
          </select>
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500">▼</span>
        </label>

        <label className="shrink-0 relative">
          <span className="sr-only">Gruppieren</span>
          <select
            value={state.group}
            onChange={(e) => onChange({ ...state, group: e.target.value as GroupKey })}
            className={`appearance-none h-8 rounded-full border pl-3 pr-7 text-xs font-medium outline-none ${
              state.group !== "none" ? "bg-indigo-500/20 border-indigo-400/60 text-white" : "bg-white/5 border-white/10 text-zinc-300"
            }`}
          >
            {(Object.keys(GROUP_LABEL) as GroupKey[]).map((k) => (
              <option key={k} value={k}>
                {k === "none" ? "Gruppieren: aus" : `Gruppieren: ${GROUP_LABEL[k]}`}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500">▼</span>
        </label>

        {anyActive ? (
          <button
            type="button"
            onClick={() => onChange({ ...state, search: "", colors: [], rarity: "", set: "", type: "" })}
            className="shrink-0 h-8 px-2 text-xs text-zinc-400 hover:text-white"
          >
            Zurücksetzen
          </button>
        ) : null}
      </div>

      {moreOpen && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-xl bg-white/5 border border-white/10 p-3">
          <label className="text-xs text-zinc-400 space-y-1">
            <span>Set</span>
            <select
              value={state.set}
              onChange={(e) => onChange({ ...state, set: e.target.value })}
              className="w-full h-10 rounded-lg bg-zinc-900 border border-white/10 px-3 text-sm text-zinc-100 outline-none"
            >
              <option value="">Alle Sets</option>
              {sets.map((s) => (
                <option key={s} value={s}>
                  {s.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-zinc-400 space-y-1">
            <span>Typ</span>
            <input
              placeholder="z. B. Creature"
              value={state.type}
              onChange={(e) => onChange({ ...state, type: e.target.value })}
              className="w-full h-10 rounded-lg bg-zinc-900 border border-white/10 px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
            />
          </label>
        </div>
      )}
    </div>
  );
}
