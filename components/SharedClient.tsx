"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { formatEur } from "@/lib/format";
import type { Card } from "@/lib/types";

export function SharedClient({
  owners,
}: {
  owners: { owner_id: string; owner_email: string }[];
}) {
  const supabase = createClient();
  const [selected, setSelected] = useState<string>("");
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  async function load(ownerId: string) {
    setSelected(ownerId);
    if (!ownerId) return;
    setLoading(true);
    const { data } = await supabase.rpc("shared_collection", { p_owner: ownerId });
    setCards((data as Card[]) ?? []);
    setLoading(false);
  }

  const filtered = cards.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );
  const total = filtered.reduce(
    (s, c) => s + ((c.foil ? c.price_eur_foil : c.price_eur) ?? 0) * c.quantity,
    0
  );

  return (
    <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">👀 Geteilte Sammlungen</h1>
        <Link href="/friends" className="text-indigo-400 hover:underline text-sm">
          Zu Freunden
        </Link>
      </header>

      {owners.length === 0 ? (
        <p className="text-zinc-500 text-sm">
          Bisher hat niemand seine Sammlung mit dir geteilt. Freigaben werden
          unter „Freunde“ vergeben.
        </p>
      ) : (
        <>
          <select
            value={selected}
            onChange={(e) => load(e.target.value)}
            className="w-full sm:w-80 rounded-md bg-zinc-800 px-3 py-2 outline-none"
          >
            <option value="">Sammlung wählen…</option>
            {owners.map((o) => (
              <option key={o.owner_id} value={o.owner_id}>
                {o.owner_email}
              </option>
            ))}
          </select>

          {selected && (
            <>
              <input
                placeholder="Karte suchen…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md bg-zinc-800 px-3 py-2 outline-none"
              />
              <p className="text-sm text-zinc-500">
                {filtered.length} Karten · Wert{" "}
                <span className="text-emerald-400">{formatEur(total)}</span>{" "}
                <span className="text-zinc-600">(nur Ansicht)</span>
              </p>

              {loading ? (
                <p className="text-zinc-500 text-sm">Lade…</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {filtered.map((c) => (
                    <div
                      key={c.id}
                      className="relative rounded-lg overflow-hidden bg-zinc-900 border border-zinc-800"
                    >
                      {c.image_url ? (
                        <Image src={c.image_url} alt={c.name} width={244} height={340} className="w-full h-auto" />
                      ) : (
                        <div className="aspect-[244/340] flex items-center justify-center text-zinc-600 text-xs p-2 text-center">
                          {c.name}
                        </div>
                      )}
                      {c.quantity > 1 && (
                        <span className="absolute top-1 right-1 bg-indigo-600 text-xs rounded-full px-2 py-0.5">
                          ×{c.quantity}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
