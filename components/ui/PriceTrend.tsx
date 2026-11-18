"use client";

import { useEffect, useMemo, useState } from "react";
import { formatEur } from "@/lib/format";
import { PERIODS, formatPercent, priceChange, type Baseline, type PeriodDays } from "@/lib/priceChange";
import type { Card } from "@/lib/types";

const KEY = "price-trend-period";

/** Lädt die früheren Preise einmal nach dem Seitenaufbau. */
export function usePriceBaselines(): Record<number, Baseline> | null {
  const [data, setData] = useState<Record<number, Baseline> | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/prices/baseline")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setData(d?.baselines ?? {}); })
      .catch(() => { if (!cancelled) setData({}); });
    return () => { cancelled = true; };
  }, []);
  return data;
}

// Gewinn/Verlust in Prozent unter dem Gesamtwert. Antippen wechselt den
// Zeitraum (seit gestern → 7 Tage → 30 Tage); die Wahl merkt sich der Browser.
export function PriceTrend({ cards, baselines }: { cards: Card[]; baselines: Record<number, Baseline> | null }) {
  const [days, setDays] = useState<PeriodDays>(7);
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(KEY));
      if (PERIODS.some((p) => p.days === v)) setDays(v as PeriodDays);
    } catch {}
  }, []);

  const change = useMemo(() => priceChange(cards, baselines?.[days]), [cards, baselines, days]);
  if (!baselines) return <p className="mt-2 h-6" aria-hidden />;
  // Gar kein Preisverlauf (Fehler oder ganz neue Sammlung) → nichts anzeigen.
  if (!Object.values(baselines).some((b) => Object.keys(b).length)) return null;

  const period = PERIODS.find((p) => p.days === days)!;
  const next = () => {
    const i = PERIODS.findIndex((p) => p.days === days);
    const n = PERIODS[(i + 1) % PERIODS.length].days;
    setDays(n);
    try { localStorage.setItem(KEY, String(n)); } catch {}
  };

  const up = change ? change.percent >= 0.05 : false;
  const down = change ? change.percent <= -0.05 : false;
  const tone = up ? "text-emerald-300 bg-emerald-500/15" : down ? "text-rose-300 bg-rose-500/15" : "text-zinc-300 bg-white/10";
  const arrow = up ? "▲" : down ? "▼" : "•";
  const hint = change
    ? `Preisentwicklung derselben Karten (${period.label}): ${change.delta >= 0 ? "+" : "−"}${formatEur(Math.abs(change.delta))}. Verglichen: ${change.matched} von ${change.total} Einträgen – neue Drucke kommen nach und nach dazu. Antippen wechselt den Zeitraum.`
    : `Für diesen Zeitraum gibt es noch keine Preise. Antippen wechselt den Zeitraum.`;

  return (
    <button
      type="button"
      onClick={next}
      title={hint}
      aria-label={change ? `${formatPercent(change.percent)} ${period.label}. ${hint}` : hint}
      className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums transition active:scale-95 ${tone}`}
    >
      {change ? (
        <>
          <span aria-hidden>{arrow}</span>
          <span>{formatPercent(change.percent)}</span>
          <span className="font-normal opacity-80">· {change.delta >= 0 ? "+" : "−"}{formatEur(Math.abs(change.delta))}</span>
        </>
      ) : (
        <span className="font-normal">noch keine Preise</span>
      )}
      <span className="font-normal opacity-70">· {period.label}</span>
    </button>
  );
}
