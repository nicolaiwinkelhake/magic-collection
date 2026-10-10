"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { formatEur } from "@/lib/format";

type Owned = { owned: number };
type Card = Owned & { id?: string; name: string; image?: string | null; eur?: number | null; gameChanger?: boolean; edhrecRank?: number | null };

const TABS = [
  { key: "buildable", label: "Baubare Commander" },
  { key: "rankings", label: "Ranglisten" },
  { key: "typal", label: "Typal" },
  { key: "sets", label: "Neue Sets" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const COLORS = ["W", "U", "B", "R", "G"];
const COLOR_NAME: Record<string, string> = { W: "Weiß", U: "Blau", B: "Schwarz", R: "Rot", G: "Grün" };

const commanderHref = (name: string) => `/commanders/${encodeURIComponent(name)}`;

async function getJson<T>(url: string): Promise<{ data: T | null; error: string | null }> {
  const res = await fetch(url).catch(() => null);
  const data = await res?.json().catch(() => null);
  if (!res?.ok || !data) return { data: null, error: data?.error ?? "Konnte nicht geladen werden." };
  return { data, error: null };
}

export function DiscoverClient() {
  const [tab, setTab] = useState<Tab>("buildable");
  return (
    <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">🔭 Entdecken</h1>
        <Link href="/collection" className="text-sm text-indigo-400 hover:underline">
          Zur Sammlung
        </Link>
      </header>
      <nav className="flex flex-wrap gap-1 border-b border-zinc-800" aria-label="Bereiche">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            aria-current={tab === t.key ? "page" : undefined}
            className={`px-3 py-2 text-sm -mb-px border-b-2 ${
              tab === t.key ? "border-indigo-500 text-white" : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {tab === "buildable" && <Buildable />}
      {tab === "rankings" && <Rankings />}
      {tab === "typal" && <Typal />}
      {tab === "sets" && <Sets />}
    </main>
  );
}

function OwnedBadge({ owned }: { owned: number }) {
  return owned > 0 ? <span className="text-emerald-400 text-xs">✔ {owned}×</span> : <span className="text-zinc-600 text-xs">fehlt</span>;
}

function CardRow({ card, href, extra }: { card: Card; href?: string; extra?: React.ReactNode }) {
  const name = href ? (
    <Link href={href} className="hover:text-indigo-300">
      {card.name}
    </Link>
  ) : (
    card.name
  );
  return (
    <li className="flex items-baseline justify-between gap-2 py-1 border-b border-zinc-800/60 text-sm">
      <span className="min-w-0 truncate">
        {name}
        {card.gameChanger && <span className="ml-1 text-xs text-amber-400">GC</span>}
      </span>
      <span className="flex items-baseline gap-3 shrink-0">
        {extra}
        {card.eur != null && <span className="text-xs text-zinc-400">{formatEur(card.eur)}</span>}
        <OwnedBadge owned={card.owned} />
      </span>
    </li>
  );
}

function Buildable() {
  const [data, setData] = useState<
    Array<{ name: string; image: string | null; identity: string[]; hasDeck: boolean; owned: number; total: number; share: number; missingValue: number }>
  | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const r = await getJson<{ commanders: NonNullable<typeof data> }>("/api/discover/buildable");
    setLoading(false);
    setError(r.error);
    if (r.data) setData(r.data.commanders);
  }

  return (
    <section className="space-y-3">
      <p className="text-sm text-zinc-400">
        Für jede Legende in deiner Sammlung: wie viele der typischen Karten ihrer Farben (Top-Karten, Ramp,
        Kartenvorteil, Removal, Wipes, Länder) du schon besitzt – und was die fehlenden kosten würden.
      </p>
      {!data && (
        <button
          onClick={load}
          disabled={loading}
          className="bg-indigo-600 hover:bg-indigo-500 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {loading ? "Analysiere Sammlung… (beim ersten Mal bis zu einer Minute)" : "Sammlung analysieren"}
        </button>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
      {data && data.length === 0 && <p className="text-sm text-zinc-500">Keine Legenden in deiner Sammlung gefunden.</p>}
      {data && data.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((c) => (
            <li key={c.name} className="flex gap-3 bg-zinc-900 border border-zinc-800 rounded-lg p-3">
              {c.image && <Image src={c.image} alt={c.name} width={73} height={102} className="rounded" />}
              <div className="min-w-0 space-y-1 text-sm">
                <Link href={commanderHref(c.name)} className="font-medium hover:text-indigo-300">
                  {c.name}
                </Link>
                <p className="text-xs text-zinc-500">{c.identity.map((x) => COLOR_NAME[x]).join(" · ") || "Farblos"}</p>
                <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${Math.round(c.share * 100)}%` }} />
                </div>
                <p className="text-xs text-zinc-400">
                  {c.owned} von {c.total} Karten ({Math.round(c.share * 100)} %) · fehlende ≈ {formatEur(c.missingValue)}
                </p>
                {c.hasDeck && <p className="text-xs text-indigo-300">Deck vorhanden</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Rankings() {
  const [colors, setColors] = useState<string[]>([]);
  const [data, setData] = useState<{
    commanders: Card[];
    gameChangers: Card[];
    groupCommanders: Array<Card & { decks: number }>;
    groupCards: Array<Card & { decks: number }>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    getJson<NonNullable<typeof data>>(`/api/discover/rankings?colors=${colors.join("")}`).then((r) => {
      setError(r.error);
      if (r.data) setData(r.data);
    });
  }, [colors]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-zinc-400">Farben:</span>
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setColors((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]))}
            aria-pressed={colors.includes(c)}
            className={`rounded-full px-3 py-1 ${colors.includes(c) ? "bg-indigo-600" : "bg-zinc-800 hover:bg-zinc-700"}`}
          >
            {COLOR_NAME[c]}
          </button>
        ))}
        <span className="text-xs text-zinc-500">(leer = alle Farben; Commander innerhalb der Auswahl)</span>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {!data && !error && <p className="text-sm text-zinc-500">Lade…</p>}
      {data && (
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h2 className="font-medium mb-1">Beliebteste Commander</h2>
            <ol className="list-decimal list-inside">
              {data.commanders.map((c) => (
                <CardRow key={c.name} card={c} href={commanderHref(c.name)} />
              ))}
            </ol>
          </div>
          <div className="space-y-6">
            <div>
              <h2 className="font-medium mb-1">Eure Gruppe: meistgespielte Commander</h2>
              {data.groupCommanders.length === 0 ? (
                <p className="text-sm text-zinc-500">Noch keine Decks in der Gruppe.</p>
              ) : (
                <ul>
                  {data.groupCommanders.map((c) => (
                    <CardRow key={c.name} card={c} href={commanderHref(c.name)} extra={<span className="text-xs text-zinc-400">{c.decks} Decks</span>} />
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h2 className="font-medium mb-1">Eure Gruppe: meistgespielte Karten</h2>
              <ul>
                {data.groupCards.slice(0, 25).map((c) => (
                  <CardRow key={c.name} card={c} extra={<span className="text-xs text-zinc-400">{c.decks} Decks</span>} />
                ))}
              </ul>
            </div>
            <div>
              <h2 className="font-medium mb-1">
                Game Changer ({data.gameChangers.filter((c) => c.owned > 0).length} von {data.gameChangers.length} besitzt du)
              </h2>
              <ul>
                {data.gameChangers.map((c) => (
                  <CardRow key={c.name} card={c} />
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Typal() {
  const [type, setType] = useState("");
  const [data, setData] = useState<{ type: string; commanders: Card[]; cards: Card[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const r = await getJson<NonNullable<typeof data>>(`/api/discover/typal?type=${encodeURIComponent(type)}`);
    setLoading(false);
    setError(r.error);
    setData(r.data);
  }

  return (
    <section className="space-y-4">
      <form onSubmit={search} className="flex flex-wrap gap-2">
        <input
          value={type}
          onChange={(e) => setType(e.target.value)}
          placeholder="Kreaturentyp (englisch), z. B. Elf, Zombie, Dragon"
          aria-label="Kreaturentyp"
          className="flex-1 min-w-[220px] rounded-md bg-zinc-800 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
        />
        <button type="submit" disabled={!type.trim() || loading} className="bg-indigo-600 hover:bg-indigo-500 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50">
          {loading ? "Suche…" : "Suchen"}
        </button>
      </form>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {data && (
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h2 className="font-medium mb-1">{data.type}-Commander</h2>
            <ul>
              {data.commanders.map((c) => (
                <CardRow key={c.name} card={c} href={commanderHref(c.name)} />
              ))}
            </ul>
          </div>
          <div>
            <h2 className="font-medium mb-1">Beliebte {data.type}-Karten</h2>
            <ul>
              {data.cards.map((c) => (
                <CardRow key={c.name} card={c} />
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

function Sets() {
  const [sets, setSets] = useState<Array<{ code: string; name: string; releasedAt: string | null }>>([]);
  const [code, setCode] = useState("");
  const [cards, setCards] = useState<Array<Card & { fitsDecks: Array<{ id: string; name: string }> }> | null>(null);
  const [onlyFitting, setOnlyFitting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getJson<{ sets: typeof sets }>("/api/discover/sets").then((r) => {
      setError(r.error);
      if (r.data) {
        setSets(r.data.sets);
        setCode(r.data.sets[0]?.code ?? "");
      }
    });
  }, []);

  useEffect(() => {
    if (!code) return;
    setCards(null);
    getJson<{ cards: NonNullable<typeof cards> }>(`/api/discover/sets?code=${code}`).then((r) => {
      setError(r.error);
      if (r.data) setCards(r.data.cards);
    });
  }, [code]);

  const shown = (cards ?? []).filter((c) => !onlyFitting || c.fitsDecks.length > 0);
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <select value={code} onChange={(e) => setCode(e.target.value)} className="rounded bg-zinc-800 px-2 py-1" aria-label="Set">
          {sets.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name} ({s.releasedAt?.slice(0, 7)})
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={onlyFitting} onChange={(e) => setOnlyFitting(e.target.checked)} />
          Nur Karten, die farblich in eines meiner Decks passen
        </label>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {!cards && !error && <p className="text-sm text-zinc-500">Lade…</p>}
      {cards && (
        <ul>
          {shown.map((c) => (
            <CardRow
              key={c.name}
              card={c}
              extra={
                c.fitsDecks.length > 0 && (
                  <span className="text-xs text-indigo-300 truncate max-w-[16rem]" title={c.fitsDecks.map((d) => d.name).join(", ")}>
                    passt: {c.fitsDecks.map((d) => d.name).join(", ")}
                  </span>
                )
              }
            />
          ))}
          {shown.length === 0 && <p className="text-sm text-zinc-500">Keine passenden Karten in diesem Set.</p>}
        </ul>
      )}
    </section>
  );
}
