"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { DeckCard } from "@/lib/deckTypes";

const COLOR_HEX: Record<string, string> = {
  W: "#e9e3c3",
  U: "#5a9bd8",
  B: "#52525b",
  R: "#e0614f",
  G: "#54a36a",
  C: "#a1a1aa", // farblos
};

const COLOR_LABEL: Record<string, string> = {
  W: "Weiß",
  U: "Blau",
  B: "Schwarz",
  R: "Rot",
  G: "Grün",
  C: "Farblos",
};

export function DeckCharts({ cards }: { cards: DeckCard[] }) {
  const nonland = cards.filter(
    (c) => !c.is_commander && !c.type_line?.toLowerCase().includes("land")
  );

  // Mana-Kurve nach Manawert (0..7+)
  const curve = [0, 1, 2, 3, 4, 5, 6, 7].map((mv) => ({
    mv: mv === 7 ? "7+" : String(mv),
    Anzahl: nonland.filter((c) =>
      mv === 7 ? (c.cmc ?? 0) >= 7 : Math.floor(c.cmc ?? 0) === mv
    ).length,
  }));

  // Farbverteilung (Karte kann zu mehreren Farben zählen)
  const colorCounts: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  for (const c of nonland) {
    const cols = c.colors ?? [];
    if (cols.length === 0) colorCounts.C += 1;
    else for (const col of cols) if (colorCounts[col] !== undefined) colorCounts[col] += 1;
  }
  const colorData = Object.entries(colorCounts)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => ({ key: k, label: COLOR_LABEL[k], Anzahl: n }));

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <div className="font-medium text-sm mb-3">Mana-Kurve</div>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={curve}>
              <XAxis dataKey="mv" stroke="#71717a" fontSize={11} />
              <YAxis stroke="#71717a" fontSize={11} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: "#27272a" }}
                contentStyle={{ background: "#18181b", border: "1px solid #3f3f46" }}
              />
              <Bar dataKey="Anzahl" fill="#818cf8" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <div className="font-medium text-sm mb-3">Farbverteilung</div>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={colorData}>
              <XAxis dataKey="label" stroke="#71717a" fontSize={11} />
              <YAxis stroke="#71717a" fontSize={11} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: "#27272a" }}
                contentStyle={{ background: "#18181b", border: "1px solid #3f3f46" }}
              />
              <Bar dataKey="Anzahl" radius={[3, 3, 0, 0]}>
                {colorData.map((entry) => (
                  <Cell key={entry.key} fill={COLOR_HEX[entry.key]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
