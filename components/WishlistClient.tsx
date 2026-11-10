"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { formatEur } from "@/lib/format";
import { CardViewer, viewerButton } from "@/components/ui/CardViewer";

type WishItem = {
  id: string;
  name: string;
  image_url: string | null;
  price_eur: number | null;
};

export function WishlistClient({
  items,
  ownership,
}: {
  items: WishItem[];
  ownership: Record<string, string[]>;
}) {
  const router = useRouter();
  const [names, setNames] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [viewIndex, setViewIndex] = useState<number | null>(null);

  const total = items.reduce((s, i) => s + (i.price_eur ?? 0), 0);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/wishlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ names }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setMessage(`Fehler: ${data.error}`);
      return;
    }
    setNames("");
    setMessage(
      data.notFound?.length
        ? `${data.added} hinzugefügt. Nicht gefunden: ${data.notFound.join(", ")}`
        : `${data.added} zur Wunschliste hinzugefügt.`
    );
    router.refresh();
  }

  async function remove(id: string) {
    await fetch("/api/wishlist", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    router.refresh();
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">⭐ Wunschliste</h1>
        <Link href="/collection" className="text-indigo-400 hover:underline text-sm">
          Zur Sammlung
        </Link>
      </header>

      <form onSubmit={add} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
        <textarea
          value={names}
          onChange={(e) => setNames(e.target.value)}
          rows={3}
          placeholder={"Mana Drain\nRhystic Study"}
          className="w-full rounded-md bg-zinc-800 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
        />
        <button
          type="submit"
          disabled={loading || !names.trim()}
          className="bg-indigo-600 hover:bg-indigo-500 transition rounded-md px-4 py-2 font-medium disabled:opacity-50"
        >
          {loading ? "Füge hinzu..." : "Hinzufügen"}
        </button>
        {message && <p className="text-sm text-zinc-300">{message}</p>}
      </form>

      <p className="text-sm text-zinc-500">
        {items.length} Karten · Gesamtwert{" "}
        <span className="text-emerald-400 font-medium">{formatEur(total)}</span>
      </p>

      {items.length === 0 ? (
        <p className="text-zinc-500 text-center py-12">
          Deine Wunschliste ist leer.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {items.map((item) => {
            const owners = ownership[item.name];
            return (
              <div
                key={item.id}
                className="relative rounded-lg overflow-hidden bg-zinc-900 border border-zinc-800 group"
              >
                <button
                  onClick={() => setViewIndex(items.indexOf(item))}
                  aria-label={`${item.name} ansehen`}
                  className="block w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                >
                  {item.image_url ? (
                    <Image src={item.image_url} alt={item.name} width={244} height={340} className="w-full h-auto" />
                  ) : (
                    <div className="aspect-[244/340] flex items-center justify-center text-zinc-600 text-sm p-2 text-center">
                      {item.name}
                    </div>
                  )}
                </button>
                <button
                  onClick={() => remove(item.id)}
                  title="Entfernen"
                  className="absolute top-1 right-1 bg-black/70 hover:bg-red-600 transition rounded-full w-6 h-6 text-xs"
                >
                  ✕
                </button>
                {item.price_eur !== null && (
                  <div className="pointer-events-none absolute bottom-0 inset-x-0 bg-black/70 text-xs px-2 py-1">
                    {formatEur(item.price_eur)}
                  </div>
                )}
                {owners?.length ? (
                  <div className="pointer-events-none absolute bottom-6 inset-x-0 bg-emerald-700/90 text-[10px] px-2 py-1 font-medium">
                    ✅ {owners.map((e) => e.split("@")[0]).join(", ")} hat sie
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      {viewIndex != null && items[viewIndex] && (
        <CardViewer
          cards={items.map((i) => ({ key: i.id, name: i.name, image_url: i.image_url, price_eur: i.price_eur }))}
          index={viewIndex}
          onIndexChange={setViewIndex}
          onClose={() => setViewIndex(null)}
          info={(c) => {
            const owners = ownership[c.name];
            return owners?.length ? (
              <p className="text-sm text-emerald-400">✅ {owners.map((e) => e.split("@")[0]).join(", ")} hat sie</p>
            ) : null;
          }}
          actions={(c) => (
            <button
              onClick={() => {
                setViewIndex(null);
                void remove(c.key);
              }}
              className={viewerButton.danger}
            >
              Von der Wunschliste entfernen
            </button>
          )}
        />
      )}
    </main>
  );
}
