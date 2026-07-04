"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { formatEur } from "@/lib/format";

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

export function SetsClient({ rows }: { rows: Row[] }) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = rows.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">🗂️ Set-Fortschritt</h1>
        <Link href="/collection" className="text-indigo-400 hover:underline text-sm">
          Zur Sammlung
        </Link>
      </header>

      <p className="text-sm text-zinc-400">
        Zeigt pro Set, wie viele verschiedene Karten du besitzt. Klicke auf ein Set um die Karten zu sehen.
      </p>

      <input
        placeholder="Set suchen…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-md bg-zinc-800 px-3 py-2 outline-none"
      />

      {filtered.length === 0 ? (
        <p className="text-zinc-500 text-center py-12">Keine Sets gefunden.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const pct = r.total > 0 ? Math.round((r.owned / r.total) * 100) : 0;
            const isOpen = expanded === r.code;
            return (
              <div key={r.code} className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
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
                      {r.cards.map((c) => (
                        <div key={c.scryfall_id + String(c.foil)} className="relative rounded-lg overflow-hidden bg-zinc-800 border border-zinc-700">
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
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
