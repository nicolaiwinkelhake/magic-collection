"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { formatEur } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { ColorIdentity } from "@/components/ui/Mana";
import { TradeComposer } from "@/components/TradeComposer";
import { addToBasket, type Basket } from "@/lib/tradeBasket";
import type { DeckHealth, FriendCopy, Swap, SwapIn, SwapOut } from "@/lib/deckDoctor";
import { ROLE_LABEL, type CardRole } from "@/lib/cardRoles";
import { edhrecSlug } from "@/lib/edhrec";
import { SwipeSheet } from "@/components/ui/SwipeSheet";
import { EDHREC_LIST, explainIn, explainOut } from "@/lib/swapExplain";
import { cardmarket, getJson, Hint, Loading, ScoreRing, SourceBadge, Thumb } from "@/components/discoverShared";

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
const pct = (x: number) => `${Math.round(x * 100)} %`;


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
      {tab === "decks" && <DeckCheck />}
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
// 1) Deck-Check
// ---------------------------------------------------------------------------

type DeckSummary = {
  id: string;
  name: string;
  commander: string;
  image: string | null;
  identity: string[];
  health: DeckHealth;
  /** Gesamtnote (Gerüst + Stimmigkeit) */
  overall: number;
  /** die wichtigsten Schritte in Kurzform */
  steps: string[];
  label: { label: string; tone: "good" | "ok" | "bad" };
};

function DeckCheck() {
  const [decks, setDecks] = useState<DeckSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      <p className="text-sm text-zinc-400">Tippe ein Deck an: Du bekommst die wichtigsten Schritte und konkrete Vorschläge, die du direkt übernehmen kannst.</p>
      <ul className="space-y-2.5">
        {decks.map((d) => (
          <li key={d.id}>
            <Link href={`/discover/deck/${d.id}`} className="surface press flex items-center gap-3 p-3">
              <Thumb src={d.image} alt={d.commander} w={44} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="font-semibold truncate">{d.name}</span>
                  <ColorIdentity colors={d.identity} size="xs" />
                </span>
                <span className="block text-xs text-zinc-500 truncate">{d.commander}</span>
                <span className="block text-xs text-zinc-300 mt-0.5 truncate">{d.steps.length ? d.steps.join(" · ") : "Grundgerüst passt – Feinschliff ansehen"}</span>
              </span>
              <ScoreRing score={d.overall} tone={d.label.tone} />
              <span className="text-zinc-500 text-lg" aria-hidden>
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
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
