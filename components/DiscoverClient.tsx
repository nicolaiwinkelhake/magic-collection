"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { formatEur } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { ColorIdentity } from "@/components/ui/Mana";
import { TradeComposer } from "@/components/TradeComposer";
import { addToBasket, type Basket } from "@/lib/tradeBasket";
import type { DeckHealth, FriendCopy, Swap, SwapIn } from "@/lib/deckDoctor";

// Entdecken – entlang der Fragen, die Spieler wirklich haben:
// 1) Deck-Check: Wo hakt mein Deck, welcher Tausch lohnt sich?
// 2) Bei Freunden: Was haben meine Kumpels, das in meine Decks passt?
// 3) Synergien: Combos und ungenutzte Karten mit Potenzial in meiner Sammlung
// 4) Neues Deck: Welchen Commander kann ich aus meiner Sammlung bauen?
// Grundlage: EDHREC-Statistik, Scryfall-Kartenrollen, Commander Spellbook.

const TABS = [
  { key: "decks", label: "Deck-Check" },
  { key: "friends", label: "Bei Freunden" },
  { key: "synergies", label: "Synergien" },
  { key: "new", label: "Neues Deck" },
] as const;
type Tab = (typeof TABS)[number]["key"];
const TAB_KEY = "discover-tab";

const commanderHref = (name: string) => `/commanders/${encodeURIComponent(name)}`;
const cardmarket = (name: string) => `https://www.cardmarket.com/de/Magic/Products/Search?searchString=${encodeURIComponent(name)}`;
const pct = (x: number) => `${Math.round(x * 100)} %`;

async function getJson<T>(url: string): Promise<{ data: T | null; error: string | null }> {
  const res = await fetch(url).catch(() => null);
  const data = await res?.json().catch(() => null);
  if (!res?.ok || !data) return { data: null, error: data?.error ?? "Konnte nicht geladen werden." };
  return { data, error: null };
}

type TradeState = { partner: { id: string; name: string }; basket: Basket } | null;

export function DiscoverClient() {
  const [tab, setTab] = useState<Tab>("decks");
  const [trade, setTrade] = useState<TradeState>(null);
  const [tradeOpen, setTradeOpen] = useState(false);

  useEffect(() => {
    try {
      const t = window.localStorage.getItem(TAB_KEY) as Tab | null;
      if (t && TABS.some((x) => x.key === t)) setTab(t);
    } catch {
      // Speicher gesperrt
    }
  }, []);
  const choose = (t: Tab) => {
    setTab(t);
    try {
      window.localStorage.setItem(TAB_KEY, t);
    } catch {
      // ignorieren
    }
  };

  // Karte eines Freundes in den Trade legen (Korb je Freund)
  const requestTrade = useCallback((copy: FriendCopy) => {
    setTrade((cur) => {
      const same = cur && cur.partner.id === copy.ownerId;
      const basket = addToBasket(same ? cur!.basket : [], [copy.card]);
      return { partner: { id: copy.ownerId, name: copy.ownerName }, basket };
    });
    setTradeOpen(true);
  }, []);

  return (
    <main className="page max-w-5xl">
      <PageHeader title="Entdecken" subtitle="Was dein Deck braucht, was deine Freunde haben, was in deiner Sammlung steckt" />
      <nav className="segmented" aria-label="Bereiche">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => choose(t.key)} aria-current={tab === t.key ? "page" : undefined} className={`segment ${tab === t.key ? "segment-active" : ""}`}>
            {t.label}
          </button>
        ))}
      </nav>
      {tab === "decks" && <DeckCheck onTrade={requestTrade} />}
      {tab === "friends" && <Friends onTrade={requestTrade} />}
      {tab === "synergies" && <Synergies onTrade={requestTrade} />}
      {tab === "new" && <NewDeck />}

      {trade && !tradeOpen && trade.basket.length > 0 && (
        <div className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] lg:bottom-4 z-40 mx-auto max-w-md">
          <button onClick={() => setTradeOpen(true)} className="press w-full flex items-center gap-3 rounded-2xl bg-gradient-to-r from-indigo-500 to-fuchsia-600 px-4 py-3 text-left shadow-glow ring-1 ring-inset ring-white/20">
            <span aria-hidden>🔁</span>
            <span className="flex-1 text-sm font-semibold">Trade mit {trade.partner.name} · {trade.basket.length} {trade.basket.length === 1 ? "Karte" : "Karten"}</span>
            <span className="text-sm font-semibold">Weiter ›</span>
          </button>
        </div>
      )}
      {trade && tradeOpen && (
        <TradeComposer
          partner={trade.partner}
          receive={trade.basket}
          onReceiveChange={(b) => setTrade((t) => (t ? { ...t, basket: b } : t))}
          onClose={() => setTradeOpen(false)}
          onSent={() => setTrade((t) => (t ? { ...t, basket: [] } : t))}
        />
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Bausteine
// ---------------------------------------------------------------------------

function Loading({ text }: { text: string }) {
  return (
    <div className="space-y-2" aria-live="polite">
      <p className="text-sm text-zinc-400">{text}</p>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="h-20 rounded-2xl bg-white/[0.04] animate-pulse" />
      ))}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="surface p-4 text-sm text-zinc-400">{children}</p>;
}

function ScoreRing({ score, tone }: { score: number; tone: "good" | "ok" | "bad" }) {
  const color = tone === "good" ? "#34d399" : tone === "ok" ? "#fbbf24" : "#f87171";
  return (
    <span
      className="grid place-items-center w-12 h-12 shrink-0 rounded-full text-sm font-bold tabular-nums"
      style={{ background: `conic-gradient(${color} ${score * 3.6}deg, rgba(255,255,255,0.08) 0)` }}
      aria-label={`${score} von 100 Punkten`}
    >
      <span className="grid place-items-center w-9 h-9 rounded-full bg-zinc-900">{score}</span>
    </span>
  );
}

function Thumb({ src, alt, w = 40 }: { src: string | null | undefined; alt: string; w?: number }) {
  const h = Math.round(w * 1.4);
  return (
    <span className="relative shrink-0 rounded-[5px] overflow-hidden bg-zinc-800" style={{ width: w, height: h }}>
      {src && <Image src={src} alt={alt} width={w} height={h} className="w-full h-full object-cover" />}
    </span>
  );
}

function SourceBadge({ add, onTrade }: { add: SwapIn; onTrade: (c: FriendCopy) => void }) {
  if (add.source === "collection") return <span className="rounded-full bg-emerald-500/15 text-emerald-300 px-2 py-0.5 text-[11px] font-medium">In deiner Sammlung</span>;
  if (add.source === "friend" && add.friend)
    return (
      <button onClick={() => onTrade(add.friend!)} className="press rounded-full bg-indigo-500/20 text-indigo-200 px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ring-indigo-400/40">
        {add.friend.ownerName} hat sie · Trade
      </button>
    );
  return (
    <a href={cardmarket(add.name)} target="_blank" rel="noopener noreferrer" className="rounded-full bg-white/[0.06] text-zinc-300 px-2 py-0.5 text-[11px]">
      {add.eur != null ? `≈ ${formatEur(add.eur)}` : "kaufen"} ↗
    </a>
  );
}

// ---------------------------------------------------------------------------
// 1) Deck-Check
// ---------------------------------------------------------------------------

type DeckSummary = {
  id: string;
  name: string;
  commander: string;
  image: string | null;
  identity: string[];
  health: DeckHealth;
  label: { label: string; tone: "good" | "ok" | "bad" };
};

function DeckCheck({ onTrade }: { onTrade: (c: FriendCopy) => void }) {
  const [decks, setDecks] = useState<DeckSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    getJson<{ decks: DeckSummary[] }>("/api/discover/decks").then((r) => {
      setError(r.error);
      if (r.data) setDecks(r.data.decks);
    });
  }, []);

  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!decks) return <Loading text="Prüfe deine Decks …" />;
  if (!decks.length)
    return (
      <Hint>
        Noch keine Decks. <Link href="/decks" className="text-indigo-300 underline">Lege ein Deck an</Link> – dann siehst du hier, wo es hakt und welche Tausche sich lohnen.
      </Hint>
    );

  return (
    <section className="space-y-3">
      <p className="text-sm text-zinc-400">
        Gemessen am üblichen Deckbau-Gerüst (≈37 Länder, 10 Ramp, 10 Kartenvorteil, 8 Removal, 3 Wipes, niedrige Kurve) und daran, was andere Spieler mit deinem Commander spielen (EDHREC).
      </p>
      <ul className="space-y-3">
        {decks.map((d) => (
          <li key={d.id} className="surface overflow-hidden">
            <button onClick={() => setOpen(open === d.id ? null : d.id)} aria-expanded={open === d.id} className="w-full flex items-center gap-3 p-3 text-left">
              <Thumb src={d.image} alt={d.commander} w={44} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="font-semibold truncate">{d.name}</span>
                  <ColorIdentity colors={d.identity} size="xs" />
                </span>
                <span className="block text-xs text-zinc-500 truncate">{d.commander}</span>
                <span className="block text-xs text-zinc-300 mt-0.5 truncate">
                  {d.health.notes.length ? d.health.notes.slice(0, 2).join(" · ") : "Grundgerüst passt"}
                </span>
              </span>
              <ScoreRing score={d.health.score} tone={d.label.tone} />
            </button>
            {open === d.id && <DeckDetail id={d.id} onTrade={onTrade} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

type DeckDetailData = {
  deck: { id: string; name: string; commander: string };
  health: DeckHealth;
  edhrec: { numDecks: number; themes: Array<{ name: string }>; avgLands: number | null; slug: string } | null;
  swaps: Swap[];
  more: SwapIn[];
  sharing: number;
};

function DeckDetail({ id, onTrade }: { id: string; onTrade: (c: FriendCopy) => void }) {
  const [data, setData] = useState<DeckDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getJson<DeckDetailData>(`/api/discover/decks/${id}`).then((r) => {
      setError(r.error);
      setData(r.data);
    });
  }, [id]);

  if (error) return <p className="px-3 pb-3 text-sm text-red-400">{error}</p>;
  if (!data) return <p className="px-3 pb-4 text-sm text-zinc-400 animate-pulse">Vergleiche mit tausenden Decks dieses Commanders …</p>;
  const { health } = data;
  const maxCurve = Math.max(1, ...health.curve);

  return (
    <div className="border-t border-white/[0.06] p-3 space-y-4">
      {/* Gerüst */}
      <div className="grid grid-cols-[1fr_auto] gap-4">
        <ul className="space-y-1.5">
          {health.checks.map((c) => {
            const ratio = c.key === "lands" ? Math.min(1, c.have / c.target) : Math.min(1, c.have / c.target);
            return (
              <li key={c.key} className="text-xs">
                <div className="flex justify-between">
                  <span className="text-zinc-300">{c.label}</span>
                  <span className={`tabular-nums ${c.ok ? "text-zinc-400" : "text-amber-300"}`}>
                    {c.have} / {c.target}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className={`h-full rounded-full ${c.ok ? "bg-emerald-400" : "bg-amber-400"}`} style={{ width: `${ratio * 100}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
        <div className="w-28">
          <p className="text-[11px] text-zinc-400 mb-1">Kurve · Ø {health.avgCmc.toFixed(1).replace(".", ",")}</p>
          <div className="flex items-end gap-1 h-16" aria-label="Manakurve">
            {health.curve.map((n, i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                <div className="w-full rounded-t bg-indigo-400/70" style={{ height: `${(n / maxCurve) * 100}%`, minHeight: n ? 2 : 0 }} title={`${i === 7 ? "7+" : i} Mana: ${n}`} />
                <span className="text-[9px] text-zinc-500">{i === 7 ? "7+" : i}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {health.unknownRoles > 5 && <p className="text-[11px] text-zinc-500">Rollen für {health.unknownRoles} Karten werden noch ermittelt – Werte können steigen.</p>}

      {data.edhrec ? (
        <p className="text-xs text-zinc-400">
          Typisch für {data.deck.commander} ({data.edhrec.numDecks.toLocaleString("de-DE")} Decks auf EDHREC): {data.edhrec.themes.map((t) => t.name).join(", ")}
          {data.edhrec.avgLands != null && ` · Ø ${data.edhrec.avgLands} Länder`}
        </p>
      ) : (
        <p className="text-xs text-zinc-500">Für diesen Commander gibt es (noch) keine EDHREC-Statistik – Tauschvorschläge fehlen daher.</p>
      )}

      {/* Tausche */}
      {data.swaps.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Lohnende Tausche</h3>
          <ul className="space-y-2">
            {data.swaps.map((s) => (
              <li key={s.in.name} className="rounded-xl bg-white/[0.04] p-2.5">
                <div className="flex items-center gap-3">
                  <Thumb src={s.in.image} alt={s.in.name} />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="text-xs text-red-300/90 truncate">
                      − {s.out.name} <span className="text-zinc-500">({s.out.reason})</span>
                    </p>
                    <p className="text-sm font-medium truncate">+ {s.in.name}</p>
                    <p className="text-[11px] text-zinc-400 truncate">{s.in.reason}</p>
                  </div>
                </div>
                <div className="mt-1.5 flex justify-end">
                  <SourceBadge add={s.in} onTrade={onTrade} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.edhrec && data.swaps.length === 0 && <p className="text-sm text-emerald-300">Kein Tausch drängt sich auf – das Deck nutzt die typischen Karten schon gut.</p>}

      {data.more.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm text-zinc-300">Weitere passende Karten ({data.more.length})</summary>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {data.more.map((a) => (
              <li key={a.name} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-2 py-1.5 min-w-0">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm truncate">{a.name}</span>
                  <span className="block text-[11px] text-zinc-500 truncate">{a.reason}</span>
                </span>
                <SourceBadge add={a} onTrade={onTrade} />
              </li>
            ))}
          </ul>
        </details>
      )}
      {data.sharing === 0 && <p className="text-[11px] text-zinc-500">Tipp: Teilen Freunde ihre Sammlung mit dir, siehst du auch, wer die Karten hat.</p>}
      <Link href={`/decks/${data.deck.id}`} className="btn-secondary w-full h-10">
        Deck öffnen
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2) Bei Freunden
// ---------------------------------------------------------------------------

type FriendsData = {
  sharing: number;
  decks: Array<{
    deck: { id: string; name: string; commander: string; image: string | null };
    items: Array<{ name: string; inclusion: number; synergy: number; reason: string; friends: FriendCopy[] }>;
  }>;
};

function Friends({ onTrade }: { onTrade: (c: FriendCopy) => void }) {
  const [data, setData] = useState<FriendsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getJson<FriendsData>("/api/discover/friends").then((r) => {
      setError(r.error);
      setData(r.data);
    });
  }, []);

  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!data) return <Loading text="Durchsuche die Sammlungen deiner Freunde …" />;
  if (!data.sharing)
    return (
      <Hint>
        Noch teilt kein Freund seine Sammlung mit dir. Unter <Link href="/friends" className="text-indigo-300 underline">Freunde</Link> kann jeder seine Sammlung freigeben – dann siehst du hier, welche ihrer Karten in deine Decks passen.
      </Hint>
    );
  if (!data.decks.length) return <Hint>Gerade hat keiner deiner Freunde Karten, die typisch für deine Decks sind.</Hint>;

  return (
    <section className="space-y-5">
      <p className="text-sm text-zinc-400">Karten deiner Freunde, die andere Spieler mit deinen Commandern besonders oft spielen – ohne Karten, die du selbst frei hast.</p>
      {data.decks.map((g) => (
        <div key={g.deck.id} className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Thumb src={g.deck.image} alt={g.deck.commander} w={24} />
            <span className="truncate">{g.deck.name}</span>
            <span className="text-xs font-normal text-zinc-500 truncate">· {g.deck.commander}</span>
          </h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {g.items.map((it) => (
              <li key={it.name} className="surface flex items-center gap-3 p-2.5 min-w-0">
                <Thumb src={it.friends[0]?.card.image_url} alt={it.name} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{it.name}</p>
                  <p className="text-[11px] text-zinc-400 truncate">{it.reason}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {Array.from(new Map(it.friends.map((f) => [f.ownerId, f])).values()).map((f) => (
                      <button key={f.ownerId} onClick={() => onTrade(f)} className="press rounded-full bg-indigo-500/20 text-indigo-200 px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ring-indigo-400/40">
                        {f.ownerName} · Trade
                      </button>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------
// 3) Synergien
// ---------------------------------------------------------------------------

type SynergyData = {
  poolSize: number;
  combosAvailable: boolean;
  complete: Array<{ cards: string[]; produces: string[]; inDeck: string | null }>;
  almost: Array<{ cards: string[]; produces: string[]; missing: string; missingEur: number | null; missingImage: string | null; friends: FriendCopy[] }>;
  unused: Array<{ name: string; deck: string; deckId: string; inclusion: number; synergy: number; image: string | null; eur: number | null }>;
};

function Synergies({ onTrade }: { onTrade: (c: FriendCopy) => void }) {
  const [data, setData] = useState<SynergyData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getJson<SynergyData>("/api/discover/synergies").then((r) => {
      setError(r.error);
      setData(r.data);
    });
  }, []);

  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!data) return <Loading text="Suche Combos und Synergien in deiner Sammlung …" />;

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Ungenutzte Karten mit Potenzial</h3>
        <p className="text-xs text-zinc-400">Karten, die in keinem Deck stecken, aber laut EDHREC gut zu einem deiner Decks passen.</p>
        {data.unused.length === 0 ? (
          <Hint>Keine – deine freien Karten passen nicht auffällig zu deinen Decks (oder du hast noch keine Decks).</Hint>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {data.unused.map((u) => (
              <li key={u.name} className="surface flex items-center gap-3 p-2.5 min-w-0">
                <Thumb src={u.image} alt={u.name} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{u.name}</p>
                  <p className="text-[11px] text-zinc-400 truncate">
                    passt in <Link href={`/decks/${u.deckId}`} className="text-indigo-300">{u.deck}</Link> · in {pct(u.inclusion)} der Decks
                    {u.synergy >= 0.1 && ` · Synergie +${Math.round(u.synergy * 100)} %`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Combos, die du komplett besitzt</h3>
        {!data.combosAvailable ? (
          <Hint>Commander Spellbook ist gerade nicht erreichbar – bitte später erneut versuchen.</Hint>
        ) : data.complete.length === 0 ? (
          <Hint>Keine vollständige Combo in deiner Sammlung gefunden.</Hint>
        ) : (
          <ul className="space-y-2">
            {data.complete.map((c, i) => (
              <li key={i} className="surface p-3">
                <p className="text-sm font-medium">{c.cards.join(" + ")}</p>
                <p className="text-[11px] text-zinc-400">
                  {c.produces.join(" · ") || "Combo"}
                  {c.inDeck ? <span className="text-emerald-300"> · steckt in „{c.inDeck}“</span> : <span className="text-amber-300"> · in keinem Deck vereint</span>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {data.almost.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Eine Karte fehlt zur Combo</h3>
          <ul className="space-y-2">
            {data.almost.map((c, i) => (
              <li key={i} className="surface flex items-center gap-3 p-3">
                <Thumb src={c.missingImage} alt={c.missing} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    {c.cards.filter((n) => n !== c.missing).join(" + ")} <span className="font-semibold text-indigo-200">+ {c.missing}</span>
                  </p>
                  <p className="text-[11px] text-zinc-400">{c.produces.join(" · ")}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {Array.from(new Map(c.friends.map((f) => [f.ownerId, f])).values()).map((f) => (
                      <button key={f.ownerId} onClick={() => onTrade(f)} className="press rounded-full bg-indigo-500/20 text-indigo-200 px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ring-indigo-400/40">
                        {f.ownerName} hat sie · Trade
                      </button>
                    ))}
                    <a href={cardmarket(c.missing)} target="_blank" rel="noopener noreferrer" className="rounded-full bg-white/[0.06] text-zinc-300 px-2 py-0.5 text-[11px]">
                      {c.missingEur != null ? `≈ ${formatEur(c.missingEur)}` : "kaufen"} ↗
                    </a>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[11px] text-zinc-500">Combos von Commander Spellbook; geprüft wurden {data.poolSize} Karten (Deckkarten zuerst, dann die wertvollsten).</p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 4) Neues Deck
// ---------------------------------------------------------------------------

type Buildable = {
  name: string;
  image: string | null;
  colors: string[];
  hasDeck: boolean;
  numDecks: number;
  themes: string[];
  coverage: number;
  owned: number;
  total: number;
  friends: number;
  topMissing: string[];
};

function NewDeck() {
  const [list, setList] = useState<Buildable[] | null>(null);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Schrittweise: je Aufruf werden einige Commander neu bei EDHREC abgefragt
      for (let round = 0; round < 25 && !cancelled; round++) {
        const r = await getJson<{ commanders: Buildable[]; pending: number }>("/api/discover/buildable");
        if (cancelled) return;
        if (r.error || !r.data) {
          setError(r.error);
          return;
        }
        setList(r.data.commanders);
        setPending(r.data.pending);
        if (!r.data.pending) return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="space-y-4">
      <p className="text-sm text-zinc-400">
        Für jede Legende deiner Sammlung: wie viele der Karten, die andere Spieler mit ihr spielen (gewichtet nach Häufigkeit), du schon besitzt – und wie viele der fehlenden deine Freunde haben.
      </p>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {!list && !error && <Loading text="Werte deine Legenden aus …" />}
      {pending > 0 && <p className="text-xs text-indigo-300 animate-pulse">Analysiere weitere Commander … noch {pending}</p>}
      {list && list.length === 0 && pending === 0 && <Hint>Keine Legenden mit EDHREC-Statistik in deiner Sammlung gefunden.</Hint>}
      {list && list.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.map((c) => (
            <li key={c.name} className="surface flex gap-3 p-3 min-w-0">
              <Thumb src={c.image} alt={c.name} w={64} />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <Link href={commanderHref(c.name)} className="font-semibold leading-tight hover:text-indigo-300">
                    {c.name}
                  </Link>
                  {c.hasDeck && <span className="shrink-0 rounded-full bg-indigo-500/20 text-indigo-200 px-2 py-0.5 text-[10px]">Deck vorhanden</span>}
                </div>
                <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-300" style={{ width: `${Math.round(c.coverage * 100)}%` }} />
                </div>
                <p className="text-xs text-zinc-300">
                  {pct(c.coverage)} abgedeckt · {c.owned}/{c.total} typische Karten
                  {c.friends > 0 && <span className="text-indigo-300"> · {c.friends} bei Freunden</span>}
                </p>
                {c.themes.length > 0 && <p className="text-[11px] text-zinc-500 truncate">Themen: {c.themes.join(", ")}</p>}
                {c.topMissing.length > 0 && <p className="text-[11px] text-zinc-500 truncate">Fehlt z. B.: {c.topMissing.slice(0, 3).join(", ")}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <details className="surface p-3">
        <summary className="cursor-pointer text-sm font-medium">Typal-Suche (Kreaturentyp)</summary>
        <div className="mt-3">
          <Typal />
        </div>
      </details>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Typal (übernommen)
// ---------------------------------------------------------------------------

type TypalCard = { name: string; owned: number; eur?: number | null; gameChanger?: boolean };

function TypalRow({ card, href }: { card: TypalCard; href?: string }) {
  return (
    <li className="flex items-baseline justify-between gap-2 py-1 border-b border-white/5 text-sm">
      <span className="min-w-0 truncate">
        {href ? (
          <Link href={href} className="hover:text-indigo-300">
            {card.name}
          </Link>
        ) : (
          card.name
        )}
      </span>
      <span className="flex items-baseline gap-3 shrink-0">
        {card.eur != null && <span className="text-xs text-zinc-400">{formatEur(card.eur)}</span>}
        {card.owned > 0 ? <span className="text-emerald-400 text-xs">✔ {card.owned}×</span> : <span className="text-zinc-600 text-xs">fehlt</span>}
      </span>
    </li>
  );
}

function Typal() {
  const [type, setType] = useState("");
  const [data, setData] = useState<{ type: string; commanders: TypalCard[]; cards: TypalCard[] } | null>(null);
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
    <div className="space-y-3">
      <form onSubmit={search} className="flex gap-2">
        <input value={type} onChange={(e) => setType(e.target.value)} placeholder="z. B. Elf, Zombie, Dragon" aria-label="Kreaturentyp" className="input w-auto flex-1 min-w-0" />
        <button type="submit" disabled={!type.trim() || loading} className="btn-primary">
          {loading ? "…" : "Suchen"}
        </button>
      </form>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {data && (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h4 className="text-sm font-medium mb-1">{data.type}-Commander</h4>
            <ul>
              {data.commanders.map((c) => (
                <TypalRow key={c.name} card={c} href={commanderHref(c.name)} />
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-medium mb-1">Beliebte {data.type}-Karten</h4>
            <ul>
              {data.cards.map((c) => (
                <TypalRow key={c.name} card={c} />
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
