"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { formatEur } from "@/lib/format";
import { CardViewer } from "@/components/ui/CardViewer";
import { PageHeader } from "@/components/ui/PageHeader";
import type { UpcomingSet } from "@/lib/setsView";

type CardRow = {
  scryfall_id: string;
  name: string;
  image_url: string | null;
  quantity: number;
  foil: boolean;
  price_eur: number | null;
  type_line: string | null;
};

type Row = {
  code: string;
  name: string;
  owned: number;
  total: number;
  released: string;
  cards: CardRow[];
};

export function SetsClient({ rows, upcoming = [] }: { rows: Row[]; upcoming?: UpcomingSet[] }) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ code: string; index: number } | null>(null);

  const filtered = rows.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <main className="page max-w-4xl">
      <PageHeader title="Sets" subtitle="Wie viele Karten je Set du schon besitzt" />

      <UpcomingSets sets={upcoming} />

      <h2 className="text-lg font-semibold pt-1">Deine Sets</h2>
      <p className="text-sm text-zinc-400 -mt-2">
        Sortiert nach Vollständigkeit – das Set, das du am vollständigsten hast, steht oben. Antippen zeigt deine Karten daraus.
      </p>

      <input
        placeholder="Set suchen…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="input"
      />

      {filtered.length === 0 ? (
        <p className="text-zinc-500 text-center py-12">Keine Sets gefunden.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const pct = r.total > 0 ? Math.round((r.owned / r.total) * 100) : 0;
            const isOpen = expanded === r.code;
            return (
              <div key={r.code} className="surface overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : r.code)}
                  className="w-full p-3 text-left hover:bg-zinc-800 transition"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="font-medium">{r.name}</span>{" "}
                      <span className="text-xs text-zinc-500 uppercase">{r.code}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-zinc-400">
                        {r.owned}{r.total > 0 ? ` / ${r.total}` : ""}{" "}
                        {r.total > 0 && (
                          <span className="text-emerald-400 font-medium">({pct}%)</span>
                        )}
                      </span>
                      <span className="text-zinc-500 text-sm">{isOpen ? "▲" : "▼"}</span>
                    </div>
                  </div>
                  {r.total > 0 && (
                    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </button>

                {isOpen && (
                  <div className="border-t border-zinc-800 p-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                      {r.cards.map((c, i) => (
                        <button
                          key={c.scryfall_id + String(c.foil)}
                          onClick={() => setViewing({ code: r.code, index: i })}
                          aria-label={`${c.name} ansehen`}
                          className="relative rounded-lg overflow-hidden bg-zinc-800 border border-zinc-700 text-left hover:border-indigo-500 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                        >
                          {c.image_url ? (
                            <Image
                              src={c.image_url}
                              alt={c.name}
                              width={244}
                              height={340}
                              className="w-full h-auto"
                            />
                          ) : (
                            <div className="aspect-[244/340] flex items-center justify-center text-zinc-500 text-xs p-2 text-center">
                              {c.name}
                            </div>
                          )}
                          {c.foil && (
                            <span className="absolute top-1 left-1 bg-indigo-600 text-xs rounded-full px-1.5 py-0.5">
                              Foil
                            </span>
                          )}
                          {c.quantity > 1 && (
                            <span className="absolute top-1 right-1 bg-zinc-900/80 text-xs rounded-full px-1.5 py-0.5">
                              ×{c.quantity}
                            </span>
                          )}
                          <div className="absolute bottom-0 inset-x-0 bg-black/70 text-xs px-2 py-1 flex justify-between">
                            <span className="truncate text-zinc-300">{c.name}</span>
                            {c.price_eur != null && (
                              <span className="text-zinc-400 ml-1 shrink-0">{formatEur(c.price_eur)}</span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {(() => {
        const set = viewing && rows.find((r) => r.code === viewing.code);
        if (!viewing || !set || !set.cards[viewing.index]) return null;
        return (
          <CardViewer
            cards={set.cards.map((c) => ({ ...c, key: c.scryfall_id + String(c.foil), set_code: set.code }))}
            index={viewing.index}
            onIndexChange={(index) => setViewing({ code: set.code, index })}
            onClose={() => setViewing(null)}
          />
        );
      })()}
    </main>
  );
}

const dateDe = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" });

function SetIcon({ src, code }: { src: string | null; code: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className="grid place-items-center w-8 h-8 shrink-0 rounded-lg bg-white/[0.06]">
      {src && !broken ? (
        // Set-Symbol (SVG) hell einfärben
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="w-5 h-5 invert opacity-90" onError={() => setBroken(true)} />
      ) : (
        <span className="text-[9px] font-semibold uppercase text-zinc-300">{code}</span>
      )}
    </span>
  );
}

function UpcomingSets({ sets }: { sets: UpcomingSet[] }) {
  return (
    <section aria-labelledby="upcoming-title" className="space-y-2">
      <h2 id="upcoming-title" className="text-lg font-semibold">Kommende Sets</h2>
      {sets.length === 0 ? (
        <p className="text-sm text-zinc-500">Gerade sind keine neuen Sets angekündigt.</p>
      ) : (
        <ul className="surface divide-y divide-white/5 overflow-hidden">
          {sets.map((s) => {
            const info = [
              s.type,
              s.related.length ? `+ ${s.related.map((r) => r.type).join(", ")}` : null,
              s.spoiled > 0 ? `${s.spoiled} Karten bekannt` : null,
            ]
              .filter(Boolean)
              .join(" · ");
            const body = (
              <>
                <SetIcon src={s.icon} code={s.code} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{s.name}</span>
                  <span className="block truncate text-xs text-zinc-500" title={s.related.map((r) => r.name).join(", ")}>{info}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-xs font-medium text-violet-200">{dateDe(s.released)}</span>
                  <span className="block text-[11px] text-zinc-500">{s.daysLeft === 1 ? "morgen" : `in ${s.daysLeft} Tagen`}{s.url ? " ↗" : ""}</span>
                </span>
              </>
            );
            return (
              <li key={s.code}>
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noreferrer" title="Vorschau bei Scryfall" className="flex items-center gap-3 px-3 py-2 hover:bg-white/[0.03]">
                    {body}
                  </a>
                ) : (
                  <div className="flex items-center gap-3 px-3 py-2">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
