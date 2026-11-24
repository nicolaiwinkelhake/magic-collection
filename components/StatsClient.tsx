"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { createClient } from "@/lib/supabase/client";
import { formatEur, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  STATS_RANGES,
  dayString,
  formatPercent,
  priceChange,
  topMovers,
  type Baseline,
  type Mover,
  type MoverCard,
  type StatsRangeKey,
} from "@/lib/priceChange";

type TotalPoint = { captured_on: string; total_value_eur: number };
type CardPoint = { captured_on: string; price_eur: number | null; price_eur_foil: number | null };

const signedEur = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${formatEur(Math.abs(v))}`;

function MoverList({ title, items, tone, empty }: { title: string; items: Mover[]; tone: "up" | "down"; empty: string }) {
  const color = tone === "up" ? "text-emerald-400" : "text-rose-400";
  return (
    <div className="space-y-2">
      <h3 className={`text-sm font-semibold ${color}`}>{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-zinc-500">{empty}</p>
      ) : (
        <ol className="space-y-1.5">
          {items.map((m, i) => (
            <li key={`${m.scryfall_id}-${m.foil}`} className="flex items-center gap-3 rounded-xl bg-white/[0.03] border border-white/[0.06] p-2">
              <span className="w-4 shrink-0 text-xs text-zinc-500 text-right">{i + 1}</span>
              <span className="shrink-0 w-8 h-11 rounded overflow-hidden bg-white/5">
                {m.image_url && <Image src={m.image_url} alt="" width={32} height={44} className="w-full h-full object-cover" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {m.name}
                  {m.foil && <span className="ml-1 text-[10px] text-amber-300">Foil</span>}
                </span>
                <span className="block text-xs text-zinc-500 truncate">
                  {m.set_code ? `${m.set_code.toUpperCase()} · ` : ""}
                  {formatEur(m.before)} → {formatEur(m.now)}
                  {m.quantity > 1 ? ` · ${m.quantity}×` : ""}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className={`block text-sm font-semibold ${color}`}>{signedEur(m.delta)}</span>
                <span className={`block text-xs ${color} opacity-80`}>{formatPercent(m.percent)}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function StatsClient({
  totalHistory,
  cards,
  owned,
}: {
  totalHistory: TotalPoint[];
  cards: { scryfall_id: string; name: string }[];
  owned: MoverCard[];
}) {
  const supabase = createClient();
  const [range, setRange] = useState<StatsRangeKey>("1m");
  const [baselines, setBaselines] = useState<Partial<Record<StatsRangeKey, Baseline>>>({});
  const [baselineFrom, setBaselineFrom] = useState<Partial<Record<StatsRangeKey, string>>>({});
  const [moversLoading, setMoversLoading] = useState(false);
  const rangeDef = STATS_RANGES.find((r) => r.key === range)!;
  const since = dayString(rangeDef.days);

  // Preise zu Beginn des Zeitraums (je Zeitraum einmal laden)
  useEffect(() => {
    if (baselines[range]) return;
    let cancelled = false;
    setMoversLoading(true);
    supabase
      .rpc("price_baseline", { p_since: since })
      .then(({ data }) => {
        if (cancelled) return;
        const b: Baseline = {};
        let earliest: string | null = null;
        for (const r of (data ?? []) as Array<{ scryfall_id: string; captured_on: string; price_eur: number | null; price_eur_foil: number | null }>) {
          b[r.scryfall_id] = [r.price_eur == null ? null : Number(r.price_eur), r.price_eur_foil == null ? null : Number(r.price_eur_foil)];
          if (!earliest || r.captured_on < earliest) earliest = r.captured_on;
        }
        setBaselines((x) => ({ ...x, [range]: b }));
        if (earliest) setBaselineFrom((x) => ({ ...x, [range]: earliest! }));
        setMoversLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const movers = useMemo(() => topMovers(owned, baselines[range]), [owned, baselines, range]);
  const change = useMemo(() => priceChange(owned, baselines[range]), [owned, baselines, range]);
  const shortHistory = baselineFrom[range] && baselineFrom[range]! > since;
  const [selected, setSelected] = useState<string>(cards[0]?.scryfall_id ?? "");
  const [cardHistory, setCardHistory] = useState<CardPoint[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadCard(scryfallId: string) {
    setSelected(scryfallId);
    if (!scryfallId) return;
    setLoading(true);
    const { data } = await supabase.rpc("card_value_history", {
      p_scryfall_id: scryfallId,
    });
    setCardHistory(data ?? []);
    setLoading(false);
  }

  const rangeHistory = totalHistory.filter((p) => p.captured_on >= since);
  // 1 Tag: gestern und heute; reicht der Verlauf nicht, alles Vorhandene
  const chartHistory = rangeHistory.length >= 2 ? rangeHistory : totalHistory.slice(-2);
  const totalData = chartHistory.map((p) => ({
    date: formatDate(p.captured_on),
    Wert: Number(p.total_value_eur),
  }));

  const cardRange = cardHistory.filter((p) => p.captured_on >= since);
  const cardData = (cardRange.length >= 2 ? cardRange : cardHistory).map((p) => ({
    date: formatDate(p.captured_on),
    Normal: p.price_eur !== null ? Number(p.price_eur) : null,
    Foil: p.price_eur_foil !== null ? Number(p.price_eur_foil) : null,
  }));

  const latestTotal = totalHistory.at(-1)?.total_value_eur ?? null;

  return (
    <main className="page max-w-4xl">
      <PageHeader title="Wertverlauf" subtitle="So entwickelt sich der Wert deiner Sammlung" />

      <div className="segmented" role="tablist" aria-label="Zeitraum">
        {STATS_RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            role="tab"
            aria-selected={range === r.key}
            onClick={() => setRange(r.key)}
            className={`segment ${range === r.key ? "segment-active" : ""}`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Gesamtwert */}
      <section className="surface p-4 space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-medium">Gesamtwert der Sammlung</h2>
          {latestTotal !== null && (
            <span className="text-emerald-400 font-semibold">
              {formatEur(latestTotal)}
            </span>
          )}
        </div>
        {change && (
          <p className="text-sm text-zinc-400 -mt-1">
            Preisentwicklung {rangeDef.days === 1 ? "seit gestern" : `seit ${formatDate(baselineFrom[range] ?? since)}`}:{" "}
            <span className={`whitespace-nowrap ${change.delta > 0 ? "text-emerald-400" : change.delta < 0 ? "text-rose-400" : "text-zinc-300"}`}>
              {signedEur(change.delta)} ({formatPercent(change.percent)})
            </span>
          </p>
        )}

        {totalData.length < 2 ? (
          <p className="text-sm text-zinc-500">
            Noch nicht genug Datenpunkte. Der Verlauf entsteht mit jedem
            Preis-Update – ab dem zweiten Update siehst du hier eine Kurve.
          </p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={totalData}>
                <CartesianGrid stroke="#27272a" />
                <XAxis dataKey="date" stroke="#71717a" fontSize={12} />
                <YAxis stroke="#71717a" fontSize={12} />
                <Tooltip
                  contentStyle={{ background: "#18181b", border: "1px solid #3f3f46" }}
                  formatter={(v: number) => formatEur(v)}
                />
                <Line
                  type="monotone"
                  dataKey="Wert"
                  stroke="#34d399"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Gewinner & Verlierer */}
      <section className="surface p-4 space-y-4">
        <div>
          <h2 className="font-medium">Gewinner & Verlierer</h2>
          <p className="text-xs text-zinc-500">
            Deine Karten {rangeDef.days === 1 ? "seit gestern" : `im Zeitraum ${rangeDef.label}`} – dieselben Exemplare, Menge und Zustand eingerechnet.
            {shortHistory && ` Der Preisverlauf beginnt am ${formatDate(baselineFrom[range]!)}.`}
          </p>
        </div>
        {moversLoading && !baselines[range] ? (
          <p className="text-sm text-zinc-500">Lade Preise…</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <MoverList title="Top 5 Gewinner" items={movers.gainers} tone="up" empty="Keine Karte ist in diesem Zeitraum gestiegen." />
            <MoverList title="Top 5 Verlierer" items={movers.losers} tone="down" empty="Keine Karte ist in diesem Zeitraum gefallen." />
          </div>
        )}
      </section>

      {/* Einzelkarte */}
      <section className="surface p-4 space-y-3">
        <h2 className="font-medium">Einzelne Karte</h2>
        {cards.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Noch keine Karten in der Sammlung.
          </p>
        ) : (
          <>
            <select
              value={selected}
              onChange={(e) => loadCard(e.target.value)}
              className="input sm:w-80"
            >
              <option value="">Karte wählen…</option>
              {cards.map((c) => (
                <option key={c.scryfall_id} value={c.scryfall_id}>
                  {c.name}
                </option>
              ))}
            </select>

            {loading ? (
              <p className="text-sm text-zinc-500">Lade Verlauf…</p>
            ) : selected && cardData.length < 2 ? (
              <p className="text-sm text-zinc-500">
                Für diese Karte gibt es noch keinen Verlauf. Er entsteht mit
                jedem Preis-Update.
              </p>
            ) : cardData.length >= 2 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={cardData}>
                    <CartesianGrid stroke="#27272a" />
                    <XAxis dataKey="date" stroke="#71717a" fontSize={12} />
                    <YAxis stroke="#71717a" fontSize={12} />
                    <Tooltip
                      contentStyle={{ background: "#18181b", border: "1px solid #3f3f46" }}
                      formatter={(v: number) => formatEur(v)}
                    />
                    <Line
                      type="monotone"
                      dataKey="Normal"
                      stroke="#818cf8"
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey="Foil"
                      stroke="#fbbf24"
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}
