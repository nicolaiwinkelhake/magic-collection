"use client";

import { useState } from "react";
import { ALL_ROLES, ROLE_LABEL, ROLE_TARGETS, countRoles, type CardRole, type RoleCard } from "@/lib/cardRoles";

// Rollen-Bilanz des Decks (Ist vs. Richtwert) auf Basis der Scryfall-Tags.
export function RoleOverview<T extends RoleCard & { id: string }>({
  cards,
  roles,
  pending,
}: {
  cards: T[];
  roles: Map<string, CardRole[]>;
  pending: number | null;
}) {
  const [openRole, setOpenRole] = useState<string | null>(null);
  const { lands, byRole, unknown } = countRoles(cards, roles);

  const rows: Array<{ key: string; label: string; cards: T[] }> = [
    { key: "lands", label: "Länder", cards: lands },
    ...ALL_ROLES.map((r) => ({ key: r, label: ROLE_LABEL[r], cards: byRole[r] })),
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h3 className="font-medium">Rollen im Deck</h3>
        <span className="text-xs text-zinc-500">
          {pending
            ? `Rollen werden bei Scryfall ermittelt … noch ${pending} Karten`
            : unknown.length
            ? `${unknown.length} Karten ohne Scryfall-Daten (Schätzung per Kartentext)`
            : "Quelle: Scryfall-Tagger"}
        </span>
      </div>
      <ul className="space-y-1.5">
        {rows.map((row) => {
          const target = ROLE_TARGETS[row.key as CardRole | "lands"];
          const count = row.cards.length;
          const low = target && count < target.min;
          const pct = target ? Math.min(100, Math.round((count / target.target) * 100)) : null;
          return (
            <li key={row.key}>
              <button
                type="button"
                onClick={() => setOpenRole(openRole === row.key ? null : row.key)}
                className="w-full text-left"
                aria-expanded={openRole === row.key}
              >
                <div className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0 text-zinc-300">{row.label}</span>
                  <div className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden">
                    {pct !== null && (
                      <div
                        className={`h-full ${low ? "bg-amber-500" : "bg-emerald-500"}`}
                        style={{ width: `${pct}%` }}
                      />
                    )}
                  </div>
                  <span className={`w-20 shrink-0 text-right tabular-nums ${low ? "text-amber-400" : "text-zinc-300"}`}>
                    {count}
                    {target && <span className="text-zinc-500"> / {target.target}</span>}
                  </span>
                </div>
              </button>
              {openRole === row.key && (
                <p className="mt-1 pl-32 text-xs text-zinc-400">
                  {row.cards.length
                    ? Array.from(new Set(row.cards.map((c) => c.name))).join(" · ")
                    : "Keine Karten"}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
