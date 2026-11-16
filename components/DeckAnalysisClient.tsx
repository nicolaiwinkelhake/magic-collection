"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { TradeComposer } from "@/components/TradeComposer";
import { addToBasket, type Basket } from "@/lib/tradeBasket";
import type { DeckHealth, FriendCopy, Swap, SwapIn, SwapOut } from "@/lib/deckDoctor";
import type { DeckSynergy, PairFit, StrategyFit } from "@/lib/deckSynergy";
import { COLOR_NAME, type LandPlan, type ManaBase, type Step, type StepTab } from "@/lib/deckPlan";
import { getJson, Loading, ScoreRing, SourceBadge, Thumb } from "@/components/discoverShared";
import { SwapCompare, SynergyPanel, type Pairs } from "@/components/DeckAnalysisParts";
import { healthLabel } from "@/lib/deckDoctor";

// Deck-Analyse auf einer eigenen Seite:
//   oben das Fazit (Gesamtnote + die wichtigsten Schritte),
//   darunter drei Reiter – Gerüst (Länder, Farben, Rollen), Tausche,
//   Stimmigkeit. Vorschläge lassen sich direkt ins Deck übernehmen;
//   Lieblingskarten kann man als "behalten" markieren.

type Analysis = {
  deck: { id: string; name: string; commander: string; image: string | null };
  health: DeckHealth;
  edhrec: { numDecks: number; themes: Array<{ name: string }>; avgLands: number | null; slug: string } | null;
  strategy: { slug: string; name: string; auto: boolean; autoSlug: string } | null;
  strategies: StrategyFit[];
  synergy: DeckSynergy | null;
  overall: number;
  steps: Step[];
  mana: ManaBase;
  lands: LandPlan & { target: number; suggestions: SwapIn[] };
  kept: Array<{ id: string; name: string }>;
  size: number;
  swaps: Swap[];
  more: SwapIn[];
  sharing: number;
};

const TABS: Array<{ key: StepTab; label: string }> = [
  { key: "geruest", label: "Gerüst" },
  { key: "tausche", label: "Karten" },
  { key: "stimmigkeit", label: "Stimmigkeit" },
];

const BUDGETS: Array<{ key: string; label: string }> = [
  { key: "", label: "Alle" },
  { key: "own", label: "Nur Sammlung" },
  { key: "2", label: "bis 2 €" },
  { key: "10", label: "bis 10 €" },
];

const BUDGET_KEY = "deck-check-budget";

/** Erklärung hinter einem kleinen "?" – hält die Seite ruhig. */
function Help({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Erklärung"
        className="inline-grid place-items-center w-5 h-5 rounded-full border border-white/20 text-[11px] text-zinc-400 align-middle"
      >
        ?
      </button>
      {open && <span className="block mt-1 text-[11px] leading-snug font-normal text-zinc-400">{children}</span>}
    </>
  );
}

export function DeckAnalysisClient({ id }: { id: string }) {
  const [data, setData] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<StepTab>("tausche");
  const [theme, setTheme] = useState<string | null | undefined>(undefined);
  const [budget, setBudget] = useState("");
  const [compare, setCompare] = useState<number | null>(null);
  const [pairs, setPairs] = useState<Pairs>({});
  const [busy, setBusy] = useState<string | null>(null);
  // läuft gerade eine (Neu-)Berechnung? – dann die alten Vorschläge abblenden
  const [refreshing, setRefreshing] = useState(false);
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);
  const [trade, setTrade] = useState<{ partner: { id: string; name: string }; basket: Basket } | null>(null);
  const [tradeOpen, setTradeOpen] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);
  const strategyKey = `deck-strategy:${id}`;
  const firstLoad = useRef(true);

  useEffect(() => {
    let t: string | null = null;
    let b = "";
    try {
      t = window.localStorage.getItem(strategyKey);
      b = window.localStorage.getItem(BUDGET_KEY) ?? "";
    } catch {
      // Speicher gesperrt
    }
    setBudget(BUDGETS.some((x) => x.key === b) ? b : "");
    setTheme(t);
  }, [strategyKey]);

  const load = useCallback(async () => {
    if (theme === undefined) return;
    const q = new URLSearchParams();
    if (theme !== null) q.set("theme", theme);
    if (budget) q.set("budget", budget);
    setRefreshing(true);
    const r = await getJson<Analysis>(`/api/discover/decks/${id}?${q}`);
    setRefreshing(false);
    setError(r.error);
    if (r.data) {
      setData(r.data);
      // beim ersten Öffnen dorthin, wo der wichtigste Schritt liegt
      if (firstLoad.current && r.data.steps[0]) setTab(r.data.steps[0].tab);
      firstLoad.current = false;
    }
  }, [id, theme, budget]);
  useEffect(() => {
    void load();
  }, [load]);

  function chooseStrategy(slug: string | null) {
    setCompare(null);
    setTheme(slug);
    try {
      if (slug === null) window.localStorage.removeItem(strategyKey);
      else window.localStorage.setItem(strategyKey, slug);
    } catch {
      // ignorieren
    }
  }
  function chooseBudget(b: string) {
    setBudget(b);
    try {
      window.localStorage.setItem(BUDGET_KEY, b);
    } catch {
      // ignorieren
    }
  }
  function goTo(t: StepTab) {
    setTab(t);
    tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function say(text: string, bad = false) {
    setNote({ text, bad });
    setTimeout(() => setNote((n) => (n?.text === text ? null : n)), 3500);
  }

  // --- Umsetzen -----------------------------------------------------------
  async function post(url: string, body: unknown, method = "POST") {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const json = await res?.json().catch(() => null);
    return res?.ok ? { ok: true as const } : { ok: false as const, error: (json?.error as string | undefined) ?? "Das hat nicht geklappt." };
  }
  // nur ins Deck legen – die Sammlung bleibt unverändert
  const addToDeck = (entries: Array<{ name: string; quantity: number }>) => post(`/api/decks/${id}/cards`, { nameEntries: entries, addToCollection: false });

  async function applySwap(out: SwapOut | undefined, add: SwapIn) {
    if (busy) return;
    setBusy(add.name);
    const added = await addToDeck([{ name: add.name, quantity: 1 }]);
    if (!added.ok) {
      setBusy(null);
      return say(added.error, true);
    }
    if (out?.id) {
      const removed = await post(`/api/decks/${id}/cards`, { cardId: out.id }, "DELETE");
      if (!removed.ok) say(`${add.name} ist im Deck, ${out.name} konnte nicht entfernt werden.`, true);
      else say(`Getauscht: ${out.name} → ${add.name}`);
    } else say(`${add.name} ist jetzt im Deck`);
    setCompare(null);
    await load();
    setBusy(null);
  }
  async function addBasics() {
    if (!data || busy) return;
    setBusy("basics");
    const r = await addToDeck(data.lands.basics.map((b) => ({ name: b.name, quantity: b.count })));
    say(r.ok ? "Standardländer hinzugefügt" : r.error, !r.ok);
    await load();
    setBusy(null);
  }
  async function setKeep(cardId: string | null, name: string, keep: boolean) {
    if (!cardId || busy) return;
    setBusy(name);
    const r = await post(`/api/decks/${id}/keep`, { cardId, keep });
    say(r.ok ? (keep ? `${name} bleibt im Deck – wird nicht mehr vorgeschlagen` : `${name} darf wieder vorgeschlagen werden`) : r.error, !r.ok);
    setCompare(null);
    await load();
    setBusy(null);
  }

  // Karte eines Freundes in den Trade legen
  const requestTrade = useCallback((copy: FriendCopy) => {
    setTrade((cur) => {
      const same = cur && cur.partner.id === copy.ownerId;
      return { partner: { id: copy.ownerId, name: copy.ownerName }, basket: addToBasket(same ? cur!.basket : [], [copy.card]) };
    });
    setTradeOpen(true);
  }, []);

  // Zusammenspiel Karte↔Karte nachladen (nur für geöffnete Vergleiche)
  const asked = useRef(new Set<string>());
  const loadPairs = useCallback(
    (names: string[]) => {
      const todo = names.filter((n) => !asked.current.has(n));
      if (!todo.length) return;
      for (const n of todo) asked.current.add(n);
      setPairs((cur) => ({ ...cur, ...Object.fromEntries(todo.map((n) => [n, "loading" as const])) }));
      const qs = todo.map((n) => `card=${encodeURIComponent(n)}`).join("&");
      getJson<{ cards: Record<string, PairFit> }>(`/api/discover/pairs?deck=${id}&${qs}`).then((r) => {
        if (!r.data) for (const n of todo) asked.current.delete(n);
        setPairs((cur) => ({ ...cur, ...Object.fromEntries(todo.map((n) => [n, r.data?.cards[n] ?? { known: false, partners: [] }])) }));
      });
    },
    [id],
  );

  const back = (
    <Link href="/discover" className="inline-flex items-center gap-1 text-sm text-indigo-300">
      <span aria-hidden>‹</span> Entdecken
    </Link>
  );
  if (error && !data)
    return (
      <main className="page max-w-3xl">
        {back}
        <p className="text-sm text-red-400">{error}</p>
      </main>
    );
  if (!data)
    return (
      <main className="page max-w-3xl">
        {back}
        <Loading text="Analysiere dein Deck – vergleiche mit tausenden Decks dieses Commanders …" />
      </main>
    );

  const { health, lands, mana } = data;
  const label = healthLabel(data.overall);
  const maxCurve = Math.max(1, ...health.curve);
  const items = [...data.swaps, ...data.more.map((a) => ({ in: a })), ...lands.suggestions.map((a) => ({ in: a }))];
  const openItem = (name: string) => setCompare(items.findIndex((x) => x.in.name === name));
  const full = data.size >= 99;

  return (
    <main className="page max-w-3xl">
      {back}
      {/* Fazit */}
      <header className="surface-strong p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Thumb src={data.deck.image} alt={data.deck.commander} w={48} />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold tracking-tight truncate">{data.deck.name}</h1>
            <p className="text-xs text-zinc-400 truncate">{data.deck.commander}</p>
            <p className="mt-1 text-[11px] text-zinc-400">
              Gerüst {health.score}
              {data.synergy ? ` · Stimmigkeit ${data.synergy.score}` : ""}{" "}
              <Help>
                Gesamtnote aus zwei Teilen: <b>Gerüst</b> (genug Länder, Ramp, Kartenvorteil, Removal, Kurve – 60 %) und <b>Stimmigkeit</b> (wie typisch deine Karten für diesen Commander sind, laut EDHREC – 40 %).
              </Help>
            </p>
          </div>
          <div className="text-center">
            <ScoreRing score={data.overall} tone={label.tone} />
            <p className="text-[10px] text-zinc-400 mt-0.5">{label.label}</p>
          </div>
        </div>
        {data.steps.length > 0 ? (
          <ol className="space-y-1.5" aria-label="Die wichtigsten Schritte">
            {data.steps.map((s, i) => (
              <li key={s.key}>
                <button onClick={() => goTo(s.tab)} className="press w-full flex items-start gap-3 rounded-xl bg-white/[0.05] px-3 py-2.5 text-left">
                  <span className="grid place-items-center w-6 h-6 shrink-0 rounded-full bg-indigo-500/30 text-xs font-bold text-indigo-100">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{s.title}</span>
                    <span className="block text-xs text-zinc-400">{s.detail}</span>
                  </span>
                  <span className="text-zinc-500" aria-hidden>
                    ›
                  </span>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-emerald-300">Rundes Deck – nichts Dringendes. Unten findest du trotzdem Ideen zum Feinschliff.</p>
        )}
      </header>

      {/* Reiter */}
      <div ref={tabsRef} className="scroll-mt-20">
        <nav className="segmented" aria-label="Analyse-Bereiche">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} aria-current={tab === t.key ? "page" : undefined} className={`segment ${tab === t.key ? "segment-active" : ""}`}>
              {t.label}
              {t.key === "tausche" && full && data.swaps.length > 0 && <span className="ml-1 opacity-60 tabular-nums">{data.swaps.length}</span>}
            </button>
          ))}
        </nav>
      </div>

      {refreshing && (
        <p className="text-xs text-zinc-400 animate-pulse" role="status">
          Rechne neu …
        </p>
      )}
      <div className={`space-y-4 transition-opacity ${refreshing ? "opacity-50 pointer-events-none" : ""}`} aria-busy={refreshing}>
      {tab === "geruest" && (
        <section className="space-y-4" aria-label="Gerüst">
          <div className="surface p-3 grid grid-cols-[1fr_auto] gap-4">
            <ul className="space-y-1.5">
              {health.checks.map((c) => (
                <li key={c.key} className="text-xs">
                  <div className="flex justify-between">
                    <span className="text-zinc-300">{c.label}</span>
                    <span className={`tabular-nums ${c.ok ? "text-zinc-400" : "text-amber-300"}`}>
                      {c.have} / {c.target}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div className={`h-full rounded-full ${c.ok ? "bg-emerald-400" : "bg-amber-400"}`} style={{ width: `${Math.min(1, c.have / c.target) * 100}%` }} />
                  </div>
                </li>
              ))}
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
            {health.unknownRoles > 5 && <p className="col-span-2 text-[11px] text-zinc-500">Rollen für {health.unknownRoles} Karten werden noch ermittelt – Werte können steigen.</p>}
          </div>

          <div className="surface p-3 space-y-3">
            <h2 className="text-sm font-semibold">
              Länder · {mana.lands} von {lands.target}{" "}
              <Help>Richtwert für Commander: etwa {lands.target} Länder. Mit weniger als 34 bleibt man zu oft ohne Mana sitzen.</Help>
            </h2>
            {lands.missing > 0 ? (
              <>
                {lands.basics.length > 0 && (
                  <div className="rounded-xl bg-white/[0.04] p-2.5 space-y-2">
                    <p className="text-xs text-zinc-300">
                      Standardländer nach deinen Farben: {lands.basics.map((b) => `${b.count}× ${b.name}`).join(" · ")}{" "}
                      <Help>Verteilt nach dem Anteil der Farbsymbole in deinen Zaubern. Ein Teil der fehlenden Länder bleibt frei für die typischen Länder unten.</Help>
                    </p>
                    <button onClick={addBasics} disabled={!!busy} className="btn-primary h-9 px-3 text-sm">
                      {busy === "basics" ? "Füge hinzu …" : `${lands.basics.reduce((s, b) => s + b.count, 0)} Standardländer ins Deck`}
                    </button>
                  </div>
                )}
                {lands.suggestions.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-zinc-400">Typische Länder für {data.deck.commander}</p>
                    <ul className="space-y-1.5">
                      {lands.suggestions.slice(0, 8).map((a) => (
                        <AddRow key={a.name} add={a} onOpen={() => openItem(a.name)} onAdd={() => applySwap(undefined, a)} busy={busy} onTrade={requestTrade} />
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-emerald-300">Genug Länder.</p>
            )}
          </div>

          {mana.colors.length > 0 && (
            <div className="surface p-3 space-y-2">
              <h2 className="text-sm font-semibold">
                Farben der Manabasis{" "}
                <Help>Links: wie viel Prozent deiner Farbsymbole die Farbe ausmacht. Rechts: wie viele deiner Länder sie erzeugen, gegen den Richtwert. Zu wenige Quellen = die Farbe fehlt dir oft.</Help>
              </h2>
              <ul className="space-y-1.5">
                {mana.colors.map((c) => (
                  <li key={c.color} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-2 text-xs">
                    <span className="text-zinc-300">
                      {COLOR_NAME[c.color]} <span className="text-zinc-500 tabular-nums">{Math.round(c.need * 100)} %</span>
                    </span>
                    <span className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                      <span className={`block h-full rounded-full ${c.ok ? "bg-emerald-400" : "bg-amber-400"}`} style={{ width: `${Math.min(1, c.sources / Math.max(1, c.wanted)) * 100}%` }} />
                    </span>
                    <span className={`tabular-nums ${c.ok ? "text-zinc-400" : "text-amber-300"}`}>
                      {c.sources} / {c.wanted} Quellen
                    </span>
                  </li>
                ))}
              </ul>
              {mana.lands < 20 && <p className="text-[11px] text-zinc-500">Erst Länder ergänzen – danach ist der Farb-Check aussagekräftig.</p>}
            </div>
          )}
        </section>
      )}

      {tab === "tausche" && (
        <section className="space-y-3" aria-label="Karten">
          <div className="flex flex-wrap items-center gap-1.5">
            {BUDGETS.map((b) => (
              <button key={b.key || "all"} onClick={() => chooseBudget(b.key)} aria-pressed={budget === b.key} className={`chip ${budget === b.key ? "chip-active" : ""}`}>
                {b.label}
              </button>
            ))}
            <Help>Budget für Karten, die du kaufen müsstest. Karten aus deiner Sammlung und von Freunden werden immer gezeigt (außer bei „Nur Sammlung“).</Help>
          </div>
          {!data.edhrec && <p className="text-xs text-zinc-500">Für diesen Commander gibt es (noch) keine EDHREC-Statistik – Tauschvorschläge fehlen daher.</p>}
          {!full && (
            <div className="surface p-3 space-y-2">
              <h2 className="text-sm font-semibold">
                Karten ergänzen <span className="font-normal text-zinc-500">· {99 - data.size} Plätze frei</span>{" "}
                <Help>Dein Deck hat noch keine 99 Karten. Deshalb stehen hier zuerst Karten zum Hinzufügen – die besten für deinen Commander, Lücken im Gerüst zuerst.</Help>
              </h2>
              <ul className="space-y-1.5">
                {[...data.swaps.map((x) => x.in), ...data.more].map((a) => (
                  <AddRow key={a.name} add={a} onOpen={() => openItem(a.name)} onAdd={() => applySwap(undefined, a)} busy={busy} onTrade={requestTrade} />
                ))}
              </ul>
              {data.edhrec && data.swaps.length + data.more.length === 0 && <p className="text-xs text-zinc-400">{budget ? "Mit diesem Budget gibt es keine Vorschläge." : "Keine Vorschläge."}</p>}
            </div>
          )}
          {full && (
            <>
          {data.swaps.length > 0 && (
            <ul className="space-y-2">
              {data.swaps.map((s) => (
                <li key={s.in.name} className="surface p-2.5 space-y-2">
                  <button onClick={() => openItem(s.in.name)} className="w-full flex items-center gap-3 text-left" aria-label={`Tausch ansehen: ${s.out.name} gegen ${s.in.name}`}>
                    <span className="relative shrink-0 flex">
                      <Thumb src={s.out.image} alt={s.out.name} w={30} />
                      <span className="flex -ml-3 mt-2 ring-2 ring-zinc-900 rounded-[5px]">
                        <Thumb src={s.in.image} alt={s.in.name} />
                      </span>
                    </span>
                    <span className="min-w-0 flex-1 space-y-0.5">
                      <span className="block text-xs text-red-300/90 truncate">− {s.out.name}</span>
                      <span className="block text-sm font-medium truncate">+ {s.in.name}</span>
                      <span className="block text-[11px] text-zinc-400 truncate">{s.in.reason}</span>
                    </span>
                    <span className="text-zinc-500 text-lg" aria-hidden>
                      ›
                    </span>
                  </button>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <SourceBadge add={s.in} onTrade={requestTrade} />
                    <span className="flex gap-1.5">
                      <button onClick={() => setKeep(s.out.id, s.out.name, true)} disabled={!!busy || !s.out.id} className="btn-ghost h-8 px-2.5 text-xs" title={`${s.out.name} nicht mehr zum Rausnehmen vorschlagen`}>
                        Behalten
                      </button>
                      <button onClick={() => applySwap(s.out, s.in)} disabled={!!busy} className="btn-primary h-8 px-3 text-xs">
                        {busy === s.in.name ? "…" : "Tauschen"}
                      </button>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {data.edhrec && data.swaps.length === 0 && (
            <p className="text-sm text-emerald-300">{budget ? "Mit diesem Budget drängt sich kein Tausch auf." : "Kein Tausch drängt sich auf – das Deck nutzt die typischen Karten schon gut."}</p>
          )}
          {data.more.length > 0 && (
            <details className="surface p-3">
              <summary className="cursor-pointer text-sm text-zinc-200">Weitere passende Karten ({data.more.length})</summary>
              <ul className="mt-2 space-y-1.5">
                {data.more.map((a) => (
                  <AddRow key={a.name} add={a} onOpen={() => openItem(a.name)} busy={busy} onTrade={requestTrade} />
                ))}
              </ul>
            </details>
          )}
            </>
          )}
          {!full && data.swaps.length > 0 && (
            <details className="surface p-3">
              <summary className="cursor-pointer text-sm text-zinc-200">Schwächste Karten im Deck ({data.swaps.length})</summary>
              <ul className="mt-2 space-y-1.5">
                {data.swaps.map((x) => (
                  <li key={x.out.name} className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-2 py-1.5 min-w-0">
                    <Thumb src={x.out.image} alt={x.out.name} w={28} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm truncate">{x.out.name}</span>
                      <span className="block text-[11px] text-zinc-500 truncate">{x.out.reason}</span>
                    </span>
                    <button onClick={() => setKeep(x.out.id, x.out.name, true)} disabled={!!busy || !x.out.id} className="btn-ghost h-8 px-2.5 text-xs">
                      Behalten
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {data.sharing === 0 && <p className="text-[11px] text-zinc-500">Tipp: Teilen Freunde ihre Sammlung mit dir, siehst du auch, wer die Karten hat.</p>}
        </section>
      )}

      {tab === "stimmigkeit" && (
        <section className="space-y-3" aria-label="Stimmigkeit">
          {data.strategies.length > 1 && data.strategy && (
            <div className="surface p-3 space-y-2">
              <h2 className="text-sm font-semibold">
                Strategie <span className="font-normal text-zinc-500">· {data.strategy.auto ? "automatisch erkannt" : "von dir gewählt"}</span>{" "}
                <Help>
                  EDHREC führt für die häufigsten Themen eines Commanders eigene Statistiken. Die Prozentzahl zeigt, wie typisch dein Deck für Decks mit diesem Schwerpunkt ist; ✦ ist die beste Übereinstimmung. Vorschläge und Stimmigkeit richten sich nach deiner Wahl.
                </Help>
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {data.strategies.map((f) => {
                  const active = f.slug === data.strategy!.slug;
                  return (
                    <button key={f.slug || "general"} onClick={() => chooseStrategy(f.slug === data.strategy!.autoSlug ? null : f.slug)} className={`chip ${active ? "chip-active" : ""}`} aria-pressed={active}>
                      {f.name}
                      <span className="opacity-60 tabular-nums">{Math.round(f.fit * 100)} %</span>
                      {f.slug === data.strategy!.autoSlug && <span aria-label="beste Übereinstimmung">✦</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {data.synergy ? (
            <SynergyPanel syn={data.synergy} commander={data.deck.commander} strategy={data.strategy?.slug ? data.strategy.name : null} />
          ) : (
            <p className="text-xs text-zinc-500">Für diesen Commander gibt es (noch) keine EDHREC-Statistik.</p>
          )}
          {data.kept.length > 0 && (
            <div className="surface p-3 space-y-2">
              <h2 className="text-sm font-semibold">
                Behalten <Help>Diese Karten schlägt der Deck-Check nicht mehr zum Rausnehmen vor. Antippen hebt das auf.</Help>
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {data.kept.map((k) => (
                  <button key={k.id} onClick={() => setKeep(k.id, k.name, false)} disabled={!!busy} className="chip" title="Nicht mehr behalten">
                    {k.name} <span aria-hidden>×</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {data.edhrec && (
            <p className="text-[11px] text-zinc-500">
              Grundlage: {data.edhrec.numDecks.toLocaleString("de-DE")} Decks mit {data.deck.commander} auf EDHREC{data.strategy?.slug ? ` (Schwerpunkt ${data.strategy.name})` : ""}.
            </p>
          )}
        </section>
      )}

      </div>

      <Link href={`/decks/${data.deck.id}`} className="btn-secondary w-full h-10">
        Deck öffnen
      </Link>

      {compare != null && compare >= 0 && (
        <SwapCompare
          items={items}
          index={compare}
          onIndexChange={setCompare}
          onClose={() => setCompare(null)}
          commander={data.deck.commander}
          numDecks={data.edhrec?.numDecks ?? null}
          themes={(data.edhrec?.themes ?? []).map((t) => t.name)}
          pairs={pairs}
          loadPairs={loadPairs}
          health={health}
          edhrecSlug={data.edhrec?.slug ?? null}
          onTrade={requestTrade}
          actions={(item) => (
            <>
              {(item.out || !full || item.in.typeLine.includes("Land")) && (
                <button onClick={() => applySwap(item.out, item.in)} disabled={!!busy} className="btn-primary h-10 text-sm">
                  {busy === item.in.name ? "Wird übernommen …" : item.out ? "Tausch ins Deck übernehmen" : `${item.in.name} ins Deck`}
                </button>
              )}
              {item.out?.id && (
                <button onClick={() => setKeep(item.out!.id, item.out!.name, true)} disabled={!!busy} className="btn-secondary h-10 text-sm">
                  {item.out.name} behalten
                </button>
              )}
            </>
          )}
        />
      )}

      {note && (
        <div
          role="status"
          className={`fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] lg:bottom-4 z-[70] mx-auto max-w-md rounded-2xl px-4 py-3 text-sm shadow-card ring-1 ring-inset ${
            note.bad ? "bg-red-950 text-red-100 ring-red-400/30" : "bg-emerald-950 text-emerald-100 ring-emerald-400/30"
          }`}
        >
          {note.text}
        </div>
      )}
      {trade && !tradeOpen && trade.basket.length > 0 && !note && (
        <div className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] lg:bottom-4 z-40 mx-auto max-w-md">
          <button onClick={() => setTradeOpen(true)} className="press w-full flex items-center gap-3 rounded-2xl bg-gradient-to-r from-indigo-500 to-fuchsia-600 px-4 py-3 text-left shadow-glow ring-1 ring-inset ring-white/20">
            <span aria-hidden>🔁</span>
            <span className="flex-1 text-sm font-semibold">
              Trade mit {trade.partner.name} · {trade.basket.length} {trade.basket.length === 1 ? "Karte" : "Karten"}
            </span>
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

/** Eine vorgeschlagene Karte mit Quelle/Preis und "ins Deck". */
function AddRow({ add, onOpen, onAdd, busy, onTrade }: { add: SwapIn; onOpen: () => void; onAdd?: () => void; busy: string | null; onTrade: (c: FriendCopy) => void }) {
  return (
    <li className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-2 py-1.5 min-w-0">
      <button onClick={onOpen} className="min-w-0 flex-1 flex items-center gap-2 text-left">
        <Thumb src={add.image} alt={add.name} w={28} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm truncate">{add.name}</span>
          <span className="block text-[11px] text-zinc-500 truncate">{add.reason}</span>
        </span>
      </button>
      <SourceBadge add={add} onTrade={onTrade} />
      {onAdd && (
        <button onClick={onAdd} disabled={!!busy} className="icon-btn w-8 h-8 shrink-0" aria-label={`${add.name} ins Deck`} title="Ins Deck">
          {busy === add.name ? "…" : "+"}
        </button>
      )}
    </li>
  );
}
