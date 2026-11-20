// Statistik-Kopf der Commander-Seite wie bei EDHREC: Mana-Kurve, Kartentypen
// im Durchschnittsdeck, in welchen Brackets und Preisklassen der Commander gespielt wird.

export type CommanderStatsData = {
  curve: number[];
  types: Array<{ key: string; label: string; value: number }>;
  brackets: number[];
  budget: { budget: number; middle: number; expensive: number } | null;
};

const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

export function CommanderStats({ stats }: { stats: CommanderStatsData }) {
  const maxCurve = Math.max(1, ...stats.curve);
  const bracketTotal = stats.brackets.reduce((a, b) => a + b, 0);
  const maxBracket = Math.max(1, ...stats.brackets);
  const b = stats.budget;
  const budgetTotal = b ? b.budget + b.middle + b.expensive : 0;
  const hasCurve = stats.curve.some((v) => v > 0);

  return (
    <section aria-label="Statistik" className="grid gap-3 sm:grid-cols-2">
      {hasCurve && (
        <div className="surface p-3 space-y-2">
          <h2 className="text-sm font-medium">Mana-Kurve</h2>
          <div className="flex items-end gap-1.5 h-24" role="img" aria-label={`Karten je Manawert: ${stats.curve.map((v, i) => `${i}${i === 7 ? "+" : ""}: ${v}`).join(", ")}`}>
            {stats.curve.map((v, i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-end h-full gap-1">
                <span className="text-[10px] text-zinc-400 tabular-nums">{v || ""}</span>
                <div className="w-full rounded-t bg-violet-500/80" style={{ height: `${Math.max(v ? 4 : 0, (v / maxCurve) * 100)}%` }} />
              </div>
            ))}
          </div>
          <div className="flex gap-1.5 text-[10px] text-zinc-500">
            {stats.curve.map((_, i) => (
              <span key={i} className="flex-1 text-center">
                {i === 7 ? "7+" : i}
              </span>
            ))}
          </div>
        </div>
      )}

      {stats.types.length > 0 && (
        <div className="surface p-3 space-y-2">
          <h2 className="text-sm font-medium">Karten im Durchschnittsdeck</h2>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {stats.types.map((t) => (
              <li key={t.key} className="flex justify-between gap-2">
                <span className="text-zinc-400">{t.label}</span>
                <span className="tabular-nums">{t.value}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {bracketTotal > 0 && (
        <div className="surface p-3 space-y-2">
          <h2 className="text-sm font-medium">Bracket der Decks</h2>
          <div className="flex items-end gap-2 h-16" role="img" aria-label={`Anteil je Bracket: ${stats.brackets.map((v, i) => `${i + 1}: ${pct(v, bracketTotal)} %`).join(", ")}`}>
            {stats.brackets.map((v, i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-end h-full gap-1">
                <span className="text-[10px] text-zinc-400 tabular-nums">{pct(v, bracketTotal)} %</span>
                <div className="w-full rounded-t bg-sky-500/70" style={{ height: `${Math.max(v ? 4 : 0, (v / maxBracket) * 100)}%` }} />
              </div>
            ))}
          </div>
          <div className="flex gap-2 text-[10px] text-zinc-500">
            {stats.brackets.map((_, i) => (
              <span key={i} className="flex-1 text-center">
                {i + 1}
              </span>
            ))}
          </div>
        </div>
      )}

      {b && budgetTotal > 0 && (
        <div className="surface p-3 space-y-2">
          <h2 className="text-sm font-medium">Preisklasse der Decks</h2>
          <div className="flex h-3 overflow-hidden rounded-full bg-white/5" role="img" aria-label={`Budget ${pct(b.budget, budgetTotal)} %, mittel ${pct(b.middle, budgetTotal)} %, teuer ${pct(b.expensive, budgetTotal)} %`}>
            <div className="bg-emerald-500/80" style={{ width: `${pct(b.budget, budgetTotal)}%` }} />
            <div className="bg-amber-400/80" style={{ width: `${pct(b.middle, budgetTotal)}%` }} />
            <div className="bg-rose-500/80" style={{ width: `${pct(b.expensive, budgetTotal)}%` }} />
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
            <li><span className="inline-block w-2 h-2 rounded-full bg-emerald-500/80 mr-1" />Budget {pct(b.budget, budgetTotal)} %</li>
            <li><span className="inline-block w-2 h-2 rounded-full bg-amber-400/80 mr-1" />Mittel {pct(b.middle, budgetTotal)} %</li>
            <li><span className="inline-block w-2 h-2 rounded-full bg-rose-500/80 mr-1" />Teuer {pct(b.expensive, budgetTotal)} %</li>
          </ul>
        </div>
      )}
    </section>
  );
}
