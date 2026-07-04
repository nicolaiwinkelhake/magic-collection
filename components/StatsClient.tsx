"use client";

import { useState } from "react";
import Link from "next/link";
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

type TotalPoint = { captured_on: string; total_value_eur: number };
type CardPoint = { captured_on: string; price_eur: number | null; price_eur_foil: number | null };

export function StatsClient({
  totalHistory,
  cards,
}: {
  totalHistory: TotalPoint[];
  cards: { scryfall_id: string; name: string }[];
}) {
  const supabase = createClient();
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

  const totalData = totalHistory.map((p) => ({
    date: formatDate(p.captured_on),
    Wert: Number(p.total_value_eur),
  }));

  const cardData = cardHistory.map((p) => ({
    date: formatDate(p.captured_on),
    Normal: p.price_eur !== null ? Number(p.price_eur) : null,
    Foil: p.price_eur_foil !== null ? Number(p.price_eur_foil) : null,
  }));

  const latestTotal = totalHistory.at(-1)?.total_value_eur ?? null;

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">📈 Wertverlauf</h1>
        <Link href="/collection" className="text-indigo-400 hover:underline text-sm">
          Zur Sammlung
        </Link>
      </header>

      {/* Gesamtwert */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-medium">Gesamtwert der Sammlung</h2>
          {latestTotal !== null && (
            <span className="text-emerald-400 font-semibold">
              {formatEur(latestTotal)}
            </span>
          )}
        </div>

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

      {/* Einzelkarte */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
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
              className="w-full sm:w-80 rounded-md bg-zinc-800 px-3 py-2 outline-none"
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
