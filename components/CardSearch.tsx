"use client";

import { useEffect, useRef, useState } from "react";
import { catalogPrint, catalogSearch, type CatalogPrint } from "@/lib/catalogClient";
import { parseSearchQuery } from "@/lib/cardSearchQuery";
import { formatEur } from "@/lib/format";
import type { ScanMatch } from "@/lib/scanStack";

// Karte von Hand in den Scan-Stapel: ein Feld für alles. Name oder sein Anfang
// (deutsch oder englisch) oder Set + Nummer wie auf der Karte („mkm 94“).
// Ergebnisse live aus dem eigenen Katalog; Enter nimmt den ersten Treffer.
// Ohne Katalog-Treffer sucht Enter wie bisher bei Scryfall (mit Vorschlägen).

export function CardSearch({
  value,
  onChange,
  onPick,
  onFallback,
  busy,
  suggestions,
  onSuggestion,
}: {
  value: string;
  onChange: (v: string) => void;
  /** Karte gewählt; `choosePrint`: danach gleich die Druckauswahl öffnen */
  onPick: (match: ScanMatch, choosePrint: boolean) => void;
  /** Suche bei Scryfall (wenn der Katalog nichts findet) */
  onFallback: (v: string) => void;
  busy: boolean;
  suggestions: string[];
  onSuggestion: (v: string) => void;
}) {
  const [results, setResults] = useState<CatalogPrint[]>([]);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const q = value.trim();
    const mine = ++seq.current;
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      const parsed = parseSearchQuery(q);
      const [byPrint, byName] = await Promise.all([
        Promise.all(parsed.prints.map((p) => catalogPrint(p.set, p.number))),
        catalogSearch(parsed.name, 8),
      ]);
      if (mine !== seq.current) return; // inzwischen weitergetippt
      const seen = new Set<string>();
      const list = [...byPrint.filter((x): x is CatalogPrint => !!x), ...byName].filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
      setResults(list.slice(0, 8));
      setLoading(false);
    }, 220);
    return () => clearTimeout(t);
  }, [value]);

  const pick = (m: CatalogPrint, choosePrint: boolean) => {
    setResults([]);
    onPick(m, choosePrint);
  };
  const tooShort = value.trim().length < 2;

  return (
    <div className="space-y-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (results[0]) pick(results[0], false);
          else onFallback(value);
        }}
        className="flex gap-2"
      >
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Name oder Set + Nr."
          aria-label="Karte suchen: Name oder Set und Nummer"
          autoComplete="off"
          className="flex-1 min-w-0 h-11 rounded-xl bg-white/5 border border-white/10 px-3 outline-none focus:border-indigo-400/70"
        />
        <button
          type="submit"
          disabled={busy || tooShort}
          className="rounded-xl bg-white/10 hover:bg-white/15 px-4 text-sm disabled:opacity-40"
        >
          Hinzufügen
        </button>
      </form>
      {!value.trim() && (
        <p className="px-1 text-xs text-zinc-500">
          Der Anfang des Namens reicht – deutsch oder englisch. Oder Set + Nummer wie auf der Karte, z. B. „mkm 94“.
        </p>
      )}

      {results.length > 0 && (
        <ul className="surface divide-y divide-white/5 overflow-hidden" aria-label="Suchergebnisse">
          {results.map((m) => (
            <li key={m.id} className="flex items-center gap-2 pr-2">
              <button onClick={() => pick(m, false)} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left hover:bg-white/[0.04]">
                {m.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.imageUrl} alt="" className="w-9 h-[50px] shrink-0 rounded-[3px] object-cover bg-zinc-800" loading="lazy" />
                ) : (
                  <span className="w-9 h-[50px] shrink-0 rounded-[3px] bg-zinc-800" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{m.name}</span>
                  {m.nameDe && m.nameDe !== m.name && <span className="block truncate text-xs text-zinc-500">{m.nameDe}</span>}
                  <span className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-400">
                    <SetSymbol set={m.set ?? ""} />
                    <span className="uppercase">{m.set}</span>
                    <span>#{m.collectorNumber}</span>
                    {m.setName && <span className="truncate text-zinc-500">· {m.setName}</span>}
                  </span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-emerald-400">{m.eur != null ? formatEur(m.eur) : ""}</span>
              </button>
              <button
                onClick={() => pick(m, true)}
                className="shrink-0 rounded-full border border-white/10 px-2.5 h-8 text-xs text-zinc-300 hover:bg-white/10"
                aria-label={`${m.name} hinzufügen und Druck wählen`}
              >
                Druck…
              </button>
            </li>
          ))}
        </ul>
      )}
      {!tooShort && !loading && results.length === 0 && value.trim().length >= 3 && (
        <p className="text-xs text-zinc-500">Im Katalog nichts gefunden – „Hinzufügen“ sucht bei Scryfall.</p>
      )}

      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-zinc-500 self-center">Meintest du:</span>
          {suggestions.map((s) => (
            <button key={s} onClick={() => onSuggestion(s)} className="rounded-full bg-white/10 hover:bg-white/15 px-3 py-1 text-xs">
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Set-Symbol von Scryfall (hell eingefärbt); ohne Bild das Kürzel */
function SetSymbol({ set }: { set: string }) {
  const [broken, setBroken] = useState(false);
  if (!set || broken) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`https://svgs.scryfall.io/sets/${set}.svg`} alt="" className="w-3.5 h-3.5 invert opacity-80" onError={() => setBroken(true)} />;
}
