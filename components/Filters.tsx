"use client";

const COLOR_OPTIONS = [
  { code: "W", label: "Weiß" },
  { code: "U", label: "Blau" },
  { code: "B", label: "Schwarz" },
  { code: "R", label: "Rot" },
  { code: "G", label: "Grün" },
];

export type SortKey = "name" | "cmc" | "price" | "set" | "color";

export type FilterState = {
  search: string;
  colors: string[];
  rarity: string;
  type: string;
  set: string;
  sort: SortKey;
};

export function Filters({
  state,
  onChange,
  sets,
}: {
  state: FilterState;
  onChange: (next: FilterState) => void;
  sets: string[];
}) {
  function toggleColor(code: string) {
    const colors = state.colors.includes(code)
      ? state.colors.filter((c) => c !== code)
      : [...state.colors, code];
    onChange({ ...state, colors });
  }

  return (
    <div className="flex flex-wrap gap-3 items-center bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <input
        placeholder="Kartenname suchen..."
        value={state.search}
        onChange={(e) => onChange({ ...state, search: e.target.value })}
        className="flex-1 min-w-[180px] rounded-md bg-zinc-800 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
      />

      <div className="flex gap-1">
        {COLOR_OPTIONS.map((c) => (
          <button
            key={c.code}
            type="button"
            onClick={() => toggleColor(c.code)}
            title={c.label}
            className={`w-8 h-8 rounded-full text-xs font-bold border transition ${
              state.colors.includes(c.code)
                ? "bg-indigo-600 border-indigo-400"
                : "bg-zinc-800 border-zinc-700 hover:border-zinc-500"
            }`}
          >
            {c.code}
          </button>
        ))}
      </div>

      <select
        value={state.rarity}
        onChange={(e) => onChange({ ...state, rarity: e.target.value })}
        className="rounded-md bg-zinc-800 px-3 py-2 outline-none"
      >
        <option value="">Alle Seltenheiten</option>
        <option value="common">Common</option>
        <option value="uncommon">Uncommon</option>
        <option value="rare">Rare</option>
        <option value="mythic">Mythic</option>
      </select>

      <select
        value={state.set}
        onChange={(e) => onChange({ ...state, set: e.target.value })}
        className="rounded-md bg-zinc-800 px-3 py-2 outline-none"
      >
        <option value="">Alle Sets</option>
        {sets.map((s) => (
          <option key={s} value={s}>
            {s.toUpperCase()}
          </option>
        ))}
      </select>

      <input
        placeholder="Typ (z. B. Creature)"
        value={state.type}
        onChange={(e) => onChange({ ...state, type: e.target.value })}
        className="rounded-md bg-zinc-800 px-3 py-2 outline-none w-40"
      />

      <select
        value={state.sort}
        onChange={(e) => onChange({ ...state, sort: e.target.value as SortKey })}
        className="rounded-md bg-zinc-800 px-3 py-2 outline-none"
        title="Sortierung"
      >
        <option value="color">Sortieren: Farbe</option>
        <option value="name">Sortieren: Name</option>
        <option value="cmc">Sortieren: Manawert</option>
        <option value="price">Sortieren: Preis</option>
        <option value="set">Sortieren: Set</option>
      </select>
    </div>
  );
}
