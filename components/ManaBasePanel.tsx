"use client";

import { useMemo } from "react";
import { analyzeManaBase, typeDistribution, type ManaCard } from "@/lib/manaBase";

const COLOR_NAME: Record<string, string> = { W: "Weiß", U: "Blau", B: "Schwarz", R: "Rot", G: "Grün" };
const COLOR_BAR: Record<string, string> = {
  W: "bg-amber-100",
  U: "bg-sky-500",
  B: "bg-zinc-400",
  R: "bg-red-500",
  G: "bg-emerald-500",
};

// Mana-Basis (Farbsymbole vs. Länder-Quellen) und Typenverteilung.
export function ManaBasePanel({ cards }: { cards: Array<ManaCard & { type_line: string | null }> }) {
  const mana = useMemo(() => analyzeManaBase(cards), [cards]);
  const types = useMemo(() => typeDistribution(cards), [cards]);
  const totalTyped = types.reduce((s, t) => s + t.count, 0) || 1;
  const sourcesKnown = cards.some((c) => c.produced_mana != null);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-2">
        <h3 className="font-medium">Mana-Basis</h3>
        {!sourcesKnown ? (
          <p className="text-sm text-zinc-500">Manaquellen werden ermittelt …</p>
        ) : mana.colors.length === 0 ? (
          <p className="text-sm text-zinc-500">Keine farbigen Kosten im Deck.</p>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-zinc-500">
                  <th className="font-normal py-1">Farbe</th>
                  <th className="font-normal">Symbole</th>
                  <th className="font-normal">Länder</th>
                  <th className="font-normal">Sonst. Quellen</th>
                </tr>
              </thead>
              <tbody>
                {mana.colors.map((c) => (
                  <tr key={c.color} className="border-t border-zinc-800">
                    <td className="py-1.5">
                      <span className={`inline-block w-2.5 h-2.5 rounded-full mr-2 ${COLOR_BAR[c.color]}`} aria-hidden />
                      {COLOR_NAME[c.color]}
                    </td>
                    <td className="tabular-nums">
                      {c.pips} <span className="text-zinc-500">({Math.round(c.pipShare * 100)} %)</span>
                    </td>
                    <td className={`tabular-nums ${c.status === "low" ? "text-amber-400" : ""}`}>
                      {c.landSources} <span className="text-zinc-500">({Math.round(c.sourceShare * 100)} %)</span>
                    </td>
                    <td className="tabular-nums text-zinc-400">{c.otherSources}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {mana.warnings.map((w) => (
              <p key={w} className="text-sm rounded-md px-3 py-2 bg-amber-900/40 text-amber-300 border border-amber-800">
                ⚠️ {w}
              </p>
            ))}
            <p className="text-xs text-zinc-500">
              Faustregel: Der Anteil der Länder-Quellen einer Farbe sollte etwa ihrem Anteil an den Farbsymbolen entsprechen.
            </p>
          </>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="font-medium">Kartentypen</h3>
        <ul className="space-y-1.5 text-sm">
          {types.map((t) => (
            <li key={t.type} className="flex items-center gap-3">
              <span className="w-28 shrink-0 text-zinc-300">{t.label}</span>
              <div className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden">
                <div className="h-full bg-indigo-500" style={{ width: `${Math.round((t.count / totalTyped) * 100)}%` }} />
              </div>
              <span className="w-8 text-right tabular-nums text-zinc-300">{t.count}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
