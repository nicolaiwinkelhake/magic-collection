"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";

// Commander-Rangliste wie auf EDHREC ("Top Commanders – Past 2 Years"):
// Karten-Raster mit Rang, Name und Anzahl Decks; dazu, was man selbst hat.
// Reiter "Deine" (eigene Commander nach Beliebtheit) und "Top 100".

export type RankedCommander = {
  name: string;
  rank: number | null;
  decks: number | null;
  owned: boolean;
  /** Name des eigenen Decks mit diesem Commander */
  deck: string | null;
  image: string | null;
  colors: string[];
  /** Partner-Paar ("A // B" sind zwei Karten, keine doppelseitige Karte) */
  pair?: boolean;
};

const COLORS = [
  { key: "W", label: "Weiß", dot: "bg-amber-100" },
  { key: "U", label: "Blau", dot: "bg-sky-500" },
  { key: "B", label: "Schwarz", dot: "bg-zinc-900 ring-1 ring-white/30" },
  { key: "R", label: "Rot", dot: "bg-red-500" },
  { key: "G", label: "Grün", dot: "bg-emerald-500" },
] as const;

export function commanderHref(name: string, pair = false) {
  const [a, b] = name.split(" // ");
  // Partner-Paar → Commander-Seite mit Partner; doppelseitige Karte → Vorderseite
  return `/commanders/${encodeURIComponent(a)}${pair && b ? `?partner=${encodeURIComponent(b)}` : ""}`;
}

export function CommanderRanking({ mine, top, rankedUpTo }: { mine: RankedCommander[]; top: RankedCommander[]; rankedUpTo: number }) {
  const [tab, setTab] = useState<"mine" | "top">(mine.length ? "mine" : "top");
  const [colors, setColors] = useState<Set<string>>(new Set());
  const [onlyOwned, setOnlyOwned] = useState(false);

  const list = useMemo(() => {
    let l = tab === "mine" ? mine : top;
    if (tab === "top" && onlyOwned) l = l.filter((c) => c.owned);
    // Farbfilter wie bei EDHREC: Farbidentität enthält alle gewählten Farben
    if (colors.size) l = l.filter((c) => Array.from(colors).every((k) => c.colors.includes(k)));
    return l;
  }, [tab, mine, top, colors, onlyOwned]);

  const ownedInTop = top.filter((c) => c.owned).length;
  const toggle = (k: string) => setColors((s) => {
    const n = new Set(s);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    return n;
  });

  return (
    <section className="space-y-3">
      <div className="flex gap-2" role="tablist">
        {[
          { k: "mine" as const, label: `Deine (${mine.length})` },
          { k: "top" as const, label: "Top 100 · 2 Jahre" },
        ].map((t) => (
          <button key={t.k} role="tab" aria-selected={tab === t.k} onClick={() => setTab(t.k)} className={`chip h-10 ${tab === t.k ? "chip-active" : ""}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5 rounded-full bg-white/[0.04] border border-white/10 p-1" aria-label="Farben filtern">
          {COLORS.map((c) => (
            <button
              key={c.key}
              onClick={() => toggle(c.key)}
              aria-pressed={colors.has(c.key)}
              aria-label={c.label}
              className={`grid place-items-center w-8 h-8 rounded-full transition ${colors.has(c.key) ? "ring-2 ring-violet-300" : "opacity-50"}`}
            >
              <span className={`w-5 h-5 rounded-full ${c.dot}`} />
            </button>
          ))}
        </div>
        {tab === "top" && (
          <button onClick={() => setOnlyOwned((v) => !v)} aria-pressed={onlyOwned} className={`chip h-9 text-sm ${onlyOwned ? "chip-active" : ""}`}>
            Nur meine ({ownedInTop})
          </button>
        )}
      </div>

      {tab === "mine" && (
        <p className="text-xs text-zinc-500">
          Legendäre Kreaturen aus deiner Sammlung und Commander deiner Decks – sortiert nach Beliebtheit auf EDHREC (Platz unter den Top {rankedUpTo.toLocaleString("de-DE")}).
        </p>
      )}

      {list.length === 0 ? (
        <p className="surface p-4 text-sm text-zinc-400">
          {tab === "mine" ? "Keine passenden Commander in deiner Sammlung." : "Keine Commander in dieser Auswahl."}
        </p>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {list.map((c) => (
            <li key={c.name}>
              <Link href={commanderHref(c.name, c.pair)} className="group block">
                <span className="relative block rounded-[4.75%/3.5%] overflow-hidden bg-zinc-900 shadow-md shadow-black/40">
                  {c.image ? (
                    <Image
                      src={c.image}
                      alt={c.name}
                      width={244}
                      height={340}
                      // Ersatzbild per Scryfall-Weiterleitung: direkt laden, nicht über den Bild-Optimierer
                      unoptimized={c.image.startsWith("https://api.scryfall.com")}
                      className="w-full h-auto group-hover:scale-[1.02] transition"
                    />
                  ) : (
                    <span className="aspect-[244/340] grid place-items-center p-2 text-center text-xs text-zinc-500">{c.name}</span>
                  )}
                  <span className={`absolute top-1.5 left-1.5 rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums ${c.rank && c.rank <= 10 ? "bg-amber-400 text-zinc-900" : "bg-black/75 text-white"}`}>
                    {c.rank ? `#${c.rank}` : "–"}
                  </span>
                  {c.deck ? (
                    <span className="absolute bottom-1.5 left-1.5 right-1.5 truncate rounded-md bg-indigo-600/90 px-1.5 py-0.5 text-[10px] font-semibold text-white" title={`Dein Deck: ${c.deck}`}>
                      Dein Deck: {c.deck}
                    </span>
                  ) : c.owned && tab === "top" ? (
                    <span className="absolute bottom-1.5 right-1.5 rounded-md bg-emerald-600/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">✓ hast du</span>
                  ) : null}
                </span>
                <span className="mt-1.5 block truncate text-sm font-medium">{c.name}</span>
                <span className="block text-xs text-zinc-500 tabular-nums">
                  {c.decks != null ? `${c.decks.toLocaleString("de-DE")} Decks` : `nicht unter den Top ${rankedUpTo.toLocaleString("de-DE")}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
