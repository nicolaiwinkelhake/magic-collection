"use client";

import { useState } from "react";
import Link from "next/link";

type Row = {
  code: string;
  name: string;
  owned: number;
  total: number;
  released: string;
};

export function SetsClient({ rows }: { rows: Row[] }) {
  const [search, setSearch] = useState("");

  const filtered = rows.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">🗂️ Set-Fortschritt</h1>
        <Link href="/collection" className="text-indigo-400 hover:underline text-sm">
          Zur Sammlung
        </Link>
      </header>

      <p className="text-sm text-zinc-400">
        Zeigt pro Set, wie viele verschiedene Karten du besitzt. Nur Sets, aus
        denen du mindestens eine Karte hast.
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
            return (
              <div
                key={r.code}
                className="bg-zinc-900 border border-zinc-800 rounded-lg p-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-medium">{r.name}</span>{" "}
                    <span className="text-xs text-zinc-500 uppercase">
                      {r.code}
                    </span>
                  </div>
                  <span className="text-sm text-zinc-400">
                    {r.owned}
                    {r.total > 0 ? ` / ${r.total}` : ""}{" "}
                    {r.total > 0 && (
                      <span className="text-emerald-400 font-medium">
                        ({pct}%)
                      </span>
                    )}
                  </span>
                </div>
                {r.total > 0 && (
                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
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
