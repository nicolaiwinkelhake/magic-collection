"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { filterCards, type ListCard, type ListFilters } from "@/lib/commanderLists";
import { edhrecCardLink } from "@/lib/edhrecLinks";
import { CardViewer, viewerButton } from "@/components/ui/CardViewer";
import { formatEur } from "@/lib/format";
import type { CommanderTheme } from "@/lib/commanderProfile";
import { CommanderStats, type CommanderStatsData } from "@/components/CommanderStats";

type Overview = {
  commander: {
    name: string;
    image: string | null;
    oracleText: string;
    typeLine: string;
    rank: number | null;
    identity: string[];
    partner: { name: string; image: string | null; oracleText: string } | null;
  };
  links: { commander: string; averageDeck: string; combos: string };
  themes: CommanderTheme[];
  lists: Array<{ key: string; label: string; description?: string; cards: ListCard[] }>;
  combos: Array<{ id: string; cards: string[]; produces: string[]; missing: string[]; bracketTag: string | null }>;
  /** nur bei EDHREC-Daten: Statistik, Themen zum Umschalten, ähnliche Commander */
  edhrec?: CommanderStatsData & {
    sub: string;
    numDecks: number;
    salt: number | null;
    themes: Array<{ slug: string; name: string; count: number }>;
    similar: string[];
  };
};

const COLOR_NAME: Record<string, string> = { W: "Weiß", U: "Blau", B: "Schwarz", R: "Rot", G: "Grün" };

/** Was die einzelnen Listen bedeuten (kurz, für Einsteiger) */
const LIST_HELP: Record<string, string> = {
  newcards: "Gerade erst erschienene Karten, die schon in Decks mit diesem Commander auftauchen – Ideen für ein Upgrade.",
  highsynergycards: "Werden mit diesem Commander deutlich häufiger gespielt als in anderen Decks seiner Farben – passen besonders gut zu seiner Strategie.",
  topcards: "Die am häufigsten gespielten Karten in Decks mit diesem Commander – die Grundausstattung.",
  highliftcards: "Insgesamt eher selten gespielt, mit diesem Commander aber auffällig oft – echte Geheimtipps.",
  gamechangers: "Besonders starke Karten. Für entspannte Runden (Bracket 1–2) lieber weglassen.",
  creatures: "Kreaturen, die Spieler mit diesem Commander am häufigsten nutzen.",
  instants: "Spontanzauber, die mit diesem Commander am häufigsten gespielt werden.",
  sorceries: "Hexereien, die mit diesem Commander am häufigsten gespielt werden.",
  utilityartifacts: "Artefakte mit nützlichen Effekten (ohne Mana-Steine).",
  enchantments: "Verzauberungen, die mit diesem Commander am häufigsten gespielt werden.",
  planeswalkers: "Planeswalker, die mit diesem Commander gespielt werden.",
  battles: "Schlachten, die mit diesem Commander gespielt werden.",
  utilitylands: "Länder mit Zusatzeffekt.",
  manaartifacts: "Mana-Steine und andere Artefakte für schnelleres Mana.",
  lands: "Länder, die in Decks mit diesem Commander am häufigsten liegen.",
};

const HELP_KEY = "commander-help-closed";

function HowTo({ name, decks }: { name: string; decks: number | null }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem(HELP_KEY) === "1") setOpen(false);
    } catch {}
  }, []);
  function toggle() {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(HELP_KEY, next ? "0" : "1");
    } catch {}
  }
  return (
    <section className="rounded-2xl border border-indigo-400/25 bg-indigo-500/[0.08] p-4">
      <button type="button" onClick={toggle} aria-expanded={open} className="w-full flex items-center justify-between gap-3 text-left">
        <span className="font-medium">💡 So nutzt du diese Seite</span>
        <span className="text-xs text-zinc-400 shrink-0">{open ? "ausblenden" : "anzeigen"}</span>
      </button>
      {open && (
        <ol className="mt-3 space-y-2 text-sm text-zinc-300 list-decimal pl-5">
          <li>
            Die Listen zeigen, welche Karten andere Spieler in ihren Decks mit <b>{name}</b> spielen
            {decks ? <> – ausgewertet aus {decks.toLocaleString("de-DE")} Decks bei EDHREC</> : null}. Die Prozentzahl an jeder Karte sagt, in wie vielen dieser Decks sie steckt.
          </li>
          <li>
            In der <b>Leiste oben</b> wählst du ein Thema (z. B. Tokens) oder Budget-Decks – dann zeigen die Listen nur Karten aus solchen Decks. Daneben springst du direkt zu einer Liste.
          </li>
          <li>
            Darunter schaltest du zwischen <b>Bildern</b> und einer kompakten <b>Liste</b> um, sortierst nach Beliebtheit, Synergie oder Preis und filterst z. B. auf Karten, die dir noch fehlen.
          </li>
          <li>
            Antippen öffnet eine Karte. <b>＋ Deck</b> legt eine Karte, die du hast, in dein gewähltes Deck. <b>＋ Wunschliste</b> merkt dir eine fehlende Karte vor. Noch kein Deck? „Neues Deck mit diesem Commander“ legt eins an.
          </li>
        </ol>
      )}
    </section>
  );
}

export function CommanderClient({
  name,
  partner,
  decks,
}: {
  name: string;
  partner: string | null;
  decks: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ListFilters>({ maxPrice: null, noGameChangers: false, ownership: "all" });
  const [targetDeck, setTargetDeck] = useState<string>(decks[0]?.id ?? "");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ list: string; index: number } | null>(null);
  // Unterseite wie bei EDHREC: Thema (Slug), "budget" oder "expensive"; "" = alle Decks
  const [sub, setSub] = useState("");
  const [subLoading, setSubLoading] = useState(false);
  const [view, setViewState] = useState<"grid" | "list">("grid");
  const [sort, setSort] = useState<"popular" | "synergy" | "price">("popular");
  const [filtersOpen, setFiltersOpen] = useState(false);
  // gerade hinzugefügt (Deck-ID|Name bzw. Name), damit der Knopf sofort zum Haken wird
  const [addedToDeck, setAddedToDeck] = useState<Set<string>>(new Set());
  const [wished, setWished] = useState<Set<string>>(new Set());
  const targetDeckName = decks.find((d) => d.id === targetDeck)?.name ?? null;
  const inTargetDeck = (card: ListCard) =>
    !!targetDeck && ((targetDeckName !== null && card.inDecks.includes(targetDeckName)) || addedToDeck.has(`${targetDeck}|${card.name}`));
  useEffect(() => {
    try {
      if (localStorage.getItem("commander-view") === "list") setViewState("list");
    } catch {}
  }, []);
  const setView = (v: "grid" | "list") => {
    setViewState(v);
    try {
      localStorage.setItem("commander-view", v);
    } catch {}
  };
  const activeFilters = (filters.ownership !== "all" ? 1 : 0) + (filters.maxPrice !== null ? 1 : 0) + (filters.noGameChangers ? 1 : 0);

  // Zuerst die EDHREC-Seite; kennt EDHREC den Commander nicht, die Scryfall-Ansicht.
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ name });
    if (partner) params.set("partner", partner);
    if (sub) params.set("sub", sub);
    setError(null);
    setSubLoading(true);
    (async () => {
      try {
        let r = await fetch(`/api/commanders/edhrec?${params}`);
        let d = await r.json().catch(() => ({}));
        if (!r.ok && d.code === "no_edhrec" && !sub) {
          r = await fetch(`/api/commanders/overview?${params}`);
          d = await r.json().catch(() => ({}));
        }
        if (!r.ok) throw new Error(d.error ?? `Fehler ${r.status}`);
        if (cancelled) return;
        // Combos gibt es nur auf der Hauptseite – auf Unterseiten bleiben die vorhandenen
        setData((prev) => (sub && prev ? { ...d, combos: prev.combos } : d));
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Unbekannter Fehler";
        if (sub) {
          setNotice(msg);
          setSub("");
        } else setError(msg);
      } finally {
        if (!cancelled) setSubLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [name, partner, sub]);

  const lists = useMemo(
    () =>
      (data?.lists ?? []).map((l) => {
        const cards = filterCards(l.cards, filters);
        if (sort === "synergy") cards.sort((a, b) => (b.synergy ?? -9) - (a.synergy ?? -9));
        if (sort === "price") cards.sort((a, b) => (b.eur ?? -1) - (a.eur ?? -1));
        return { ...l, label: l.key === "highliftcards" ? "Geheimtipps" : l.label, cards };
      }),
    [data, filters, sort]
  );

  async function addToWishlist(card: ListCard) {
    setBusy(card.name);
    const res = await fetch("/api/wishlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ names: card.name }),
    });
    setBusy(null);
    if (res.ok) setWished((w) => new Set(w).add(card.name));
    setNotice(res.ok ? `„${card.name}“ auf die Wunschliste gesetzt.` : `Wunschliste: Fehler ${res.status}`);
  }

  async function addToDeck(card: ListCard) {
    if (!targetDeck) return;
    setBusy(card.name);
    const res = await fetch(`/api/decks/${targetDeck}/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Nur ins Deck – die Sammlung bleibt unverändert.
      body: JSON.stringify({ names: [card.name], addToCollection: false }),
    });
    setBusy(null);
    if (res.ok) setAddedToDeck((a) => new Set(a).add(`${targetDeck}|${card.name}`));
    const deckName = decks.find((d) => d.id === targetDeck)?.name ?? "Deck";
    setNotice(res.ok ? `„${card.name}“ zu „${deckName}“ hinzugefügt.` : `Deck: Fehler ${res.status}`);
  }

  async function createDeck() {
    if (!data) return;
    setBusy("__deck");
    const res = await fetch("/api/decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.commander.partner ? `${data.commander.name} + ${data.commander.partner.name}` : data.commander.name,
        commanderName: data.commander.name,
        partnerName: data.commander.partner?.name,
      }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(null);
    if (res.ok) router.push(`/decks/${d.deck.id}`);
    else setNotice(`Deck anlegen: ${d.error ?? res.status}`);
  }

  if (error) {
    return (
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-4">
        <Link href="/commanders" className="text-sm text-zinc-400 hover:text-white">← Commander suchen</Link>
        <p className="text-red-400">{error}</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-2">
        <Link href="/commanders" className="text-sm text-zinc-400 hover:text-white">← Commander suchen</Link>
        <p className="text-zinc-400" aria-live="polite">
          Lade Empfehlungen für {name}… Beim ersten Aufruf eines Commanders werden die Kartenlisten zusammengestellt
          (kann einen Moment dauern), danach geht es schnell.
        </p>
      </main>
    );
  }

  const c = data.commander;
  return (
    <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <Link href="/commanders" className="text-sm text-zinc-400 hover:text-white">← Commander suchen</Link>

      <header className="flex flex-col sm:flex-row gap-4">
        <div className="flex gap-2 shrink-0">
          {[c, c.partner].filter(Boolean).map((cmd) =>
            cmd!.image ? (
              <Image key={cmd!.name} src={cmd!.image} alt={cmd!.name} width={146} height={204} className="rounded-lg" />
            ) : null
          )}
        </div>
        <div className="space-y-2 min-w-0">
          <h1 className="text-2xl font-semibold">
            {c.name}
            {c.partner && <> + {c.partner.name}</>}
          </h1>
          <p className="text-sm text-zinc-400">
            {c.identity.length ? c.identity.map((x) => COLOR_NAME[x] ?? x).join(" · ") : "Farblos"}
            {c.rank && <> · Platz #{c.rank.toLocaleString("de-DE")} {data.edhrec ? "bei EDHREC" : "(Scryfall-Beliebtheit)"}</>}
            {data.edhrec && data.edhrec.numDecks > 0 && <> · {data.edhrec.numDecks.toLocaleString("de-DE")} Decks{data.edhrec.sub ? " mit dieser Auswahl" : ""}</>}
          </p>
          <p className="text-sm text-zinc-300 whitespace-pre-line">{c.oracleText}</p>
          <div className="flex flex-wrap gap-3 text-sm">
            <a href={data.links.commander} target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">
              Auf EDHREC öffnen ↗
            </a>
            <a href={data.links.averageDeck} target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">
              Durchschnitts-Deck ↗
            </a>
            <a href={data.links.combos} target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">
              Combos ↗
            </a>
            <button onClick={createDeck} disabled={busy === "__deck"} className="text-emerald-400 hover:underline disabled:opacity-50">
              + Neues Deck mit diesem Commander
            </button>
          </div>
        </div>
      </header>

      <HowTo name={c.name} decks={data.edhrec?.numDecks ?? null} />

      {data.edhrec && <CommanderStats stats={data.edhrec} />}

      {!data.edhrec && data.themes.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">Themen</h2>
          <div className="flex flex-wrap gap-2">
            {data.themes.map((t, i) => (
              <a
                key={t.name}
                href={`#theme-${i}`}
                title={t.description}
                className="rounded-full bg-zinc-800 hover:bg-zinc-700 px-3 py-1 text-sm"
              >
                {t.name}
              </a>
            ))}
          </div>
          <p className="text-xs text-zinc-500">Themen von Claude aus dem Kartentext abgeleitet, Karten von Scryfall.</p>
        </section>
      )}

      {/* Werkzeugleiste wie bei EDHREC: Auswahl, Springe zu, Ansicht, Sortierung, Filter */}
      <section
        aria-label="Werkzeugleiste"
        className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 -mx-4 px-4 py-2 space-y-2 bg-[var(--bg)]/95 backdrop-blur border-b border-white/[0.06]"
      >
        <div className="grid grid-cols-2 gap-2">
          {data.edhrec ? (
            <label className="min-w-0">
              <span className="sr-only">Decks bzw. Thema</span>
              <select value={sub} onChange={(e) => setSub(e.target.value)} className="input h-10 w-full py-0 text-sm">
                <option value="">Alle Decks{data.edhrec.numDecks ? ` (${data.edhrec.numDecks.toLocaleString("de-DE")})` : ""}</option>
                <option value="budget">Budget-Decks</option>
                <option value="expensive">Teure Decks</option>
                {data.edhrec.themes.length > 0 && (
                  <optgroup label="Thema">
                    {data.edhrec.themes.map((t) => (
                      <option key={t.slug} value={t.slug}>
                        {t.name} ({t.count.toLocaleString("de-DE")})
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </label>
          ) : (
            <span />
          )}
          <label className="min-w-0">
            <span className="sr-only">Springe zu</span>
            <select
              value=""
              onChange={(e) => {
                const el = document.getElementById(e.target.value);
                if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="input h-10 w-full py-0 text-sm"
            >
              <option value="">Springe zu …</option>
              {lists
                .filter((l) => l.cards.length > 0)
                .map((l) => (
                  <option key={l.key} value={l.key}>
                    {l.label} ({l.cards.length})
                  </option>
                ))}
            </select>
          </label>
        </div>
        <div className="flex items-center gap-2">
          <div className="segmented shrink-0 p-0.5" role="group" aria-label="Ansicht">
            {(["grid", "list"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={`segment flex-none h-8 px-3 ${view === v ? "segment-active" : ""}`}
              >
                {v === "grid" ? "Bilder" : "Liste"}
              </button>
            ))}
          </div>
          <label className="min-w-0 flex-1">
            <span className="sr-only">Sortieren</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="input h-9 w-full py-0 text-sm">
              <option value="popular">Beliebtheit</option>
              <option value="synergy">Synergie</option>
              <option value="price">Preis</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            className={`chip h-9 text-sm shrink-0 ${activeFilters ? "chip-active" : ""}`}
          >
            Filter{activeFilters ? ` (${activeFilters})` : ""}
          </button>
        </div>
        {subLoading && <p className="text-xs text-zinc-500" aria-live="polite">Lade Auswahl…</p>}
        {filtersOpen && (
          <div className="surface p-3 space-y-3 text-sm">
            <div className="space-y-1.5">
              <span className="text-xs text-zinc-400">Karten anzeigen</span>
              <div className="segmented" role="group" aria-label="Besitz">
                {(["all", "owned", "missing"] as const).map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setFilters({ ...filters, ownership: o })}
                    aria-pressed={filters.ownership === o}
                    className={`segment ${filters.ownership === o ? "segment-active" : ""}`}
                  >
                    {o === "all" ? "Alle" : o === "owned" ? "Habe ich" : "Fehlen mir"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="relative chip h-9 text-sm pr-7">
                <span className="sr-only">Höchstpreis je Karte</span>
                <select
                  value={filters.maxPrice ?? ""}
                  onChange={(e) => setFilters({ ...filters, maxPrice: e.target.value ? Number(e.target.value) : null })}
                  className="appearance-none bg-transparent outline-none"
                >
                  <option value="">Preis: egal</option>
                  <option value="1">bis 1 € je Karte</option>
                  <option value="5">bis 5 € je Karte</option>
                  <option value="15">bis 15 € je Karte</option>
                  <option value="40">bis 40 € je Karte</option>
                </select>
                <span className="pointer-events-none absolute right-2.5 text-[10px] text-zinc-500">▼</span>
              </label>
              <button
                type="button"
                onClick={() => setFilters({ ...filters, noGameChangers: !filters.noGameChangers })}
                aria-pressed={filters.noGameChangers}
                className={`chip h-9 text-sm ${filters.noGameChangers ? "chip-active" : ""}`}
                title="Game Changer sind besonders starke Karten – für entspannte Runden (Bracket 1–2) weglassen"
              >
                {filters.noGameChangers ? "✓ " : ""}Ohne Game Changer
              </button>
            </div>
            {decks.length > 0 && (
              <label className="flex items-center gap-2">
                <span className="shrink-0 text-xs text-zinc-400">＋ Deck legt Karten in</span>
                <select value={targetDeck} onChange={(e) => setTargetDeck(e.target.value)} className="input h-10 min-w-0 flex-1 py-0">
                  {decks.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
      </section>

      {notice && (
        <p className="text-sm text-emerald-300" aria-live="polite">
          {notice}
        </p>
      )}

      {lists.map((list) => (
        <section key={list.key} id={list.key} className="space-y-2 scroll-mt-44">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-medium text-lg min-w-0">{list.label}</h2>
            <span className="text-xs text-zinc-500 shrink-0">
              {list.cards.filter((x) => x.owned > 0).length} von {list.cards.length} hast du
            </span>
          </div>
          {(LIST_HELP[list.key] || list.description) && (
            <p className="text-sm text-zinc-400">
              {LIST_HELP[list.key]}
              {LIST_HELP[list.key] && list.description ? " " : ""}
              {list.description && <span className="text-zinc-500">({list.description})</span>}
            </p>
          )}
          {list.cards.length === 0 ? (
            <p className="text-sm text-zinc-500">Keine Karten für die aktuellen Filter.</p>
          ) : (
            view === "list" ? (
              <ul className="surface divide-y divide-white/[0.06] overflow-hidden">
                {list.cards.map((card, i) => (
                  <CardLine
                    key={card.id}
                    card={card}
                    numDecks={data.edhrec?.numDecks ?? null}
                    onOpen={() => {
                      setNotice(null);
                      setViewing({ list: list.key, index: i });
                    }}
                    busy={busy === card.name}
                    canAddToDeck={Boolean(targetDeck)}
                  inDeck={inTargetDeck(card)}
                  wished={wished.has(card.name)}
                    onWishlist={() => addToWishlist(card)}
                    onDeck={() => addToDeck(card)}
                  />
                ))}
              </ul>
            ) : (
            <ul className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {list.cards.map((card, i) => (
                <CardTile
                  key={card.id}
                  card={card}
                  onOpen={() => {
                    setNotice(null);
                    setViewing({ list: list.key, index: i });
                  }}
                  busy={busy === card.name}
                  canAddToDeck={Boolean(targetDeck)}
                  inDeck={inTargetDeck(card)}
                  wished={wished.has(card.name)}
                  onWishlist={() => addToWishlist(card)}
                  onDeck={() => addToDeck(card)}
                />
              ))}
            </ul>
            )
          )}
        </section>
      ))}

      {data.edhrec && data.edhrec.similar.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium text-lg">Ähnliche Commander</h2>
          <div className="flex flex-wrap gap-2">
            {data.edhrec.similar.map((n) => (
              <Link key={n} href={`/commanders/${encodeURIComponent(n)}`} className="rounded-full bg-zinc-800 hover:bg-zinc-700 px-3 py-1 text-sm">
                {n}
              </Link>
            ))}
          </div>
        </section>
      )}

      {data.combos.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium text-lg">Combos mit {c.name}</h2>
          <ul className="space-y-2 text-sm">
            {data.combos.map((combo) => (
              <li key={combo.id} className="surface rounded-xl px-3 py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>{combo.cards.join(" + ")}</span>
                  <a
                    href={`https://commanderspellbook.com/combo/${combo.id}/`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-indigo-400 hover:underline"
                  >
                    Details ↗
                  </a>
                </div>
                <p className="text-xs text-zinc-400">
                  {combo.produces.slice(0, 3).join(", ")}
                  {" · "}
                  {combo.missing.length === 0 ? (
                    <span className="text-emerald-400">alle Teile in deiner Sammlung</span>
                  ) : (
                    <span className="text-amber-400">fehlt: {combo.missing.join(", ")}</span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {data.edhrec && (
        <p className="text-xs text-zinc-500">
          Statistiken und Empfehlungen von EDHREC (Auswertung vieler Commander-Decks, wöchentlich aktualisiert). Karten, Bilder und Preise aus Scryfall, Besitz aus deiner Sammlung.
        </p>
      )}
      {(() => {
        const list = viewing && lists.find((l) => l.key === viewing.list);
        const current = list?.cards[viewing?.index ?? -1];
        if (!viewing || !list || !current) return null;
        return (
          <CardViewer
            cards={list.cards.map((x) => ({
              key: x.id,
              name: x.name,
              image_url: x.image,
              type_line: x.typeLine,
              mana_cost: x.manaCost,
              price_eur: x.eur,
              price_eur_foil: x.eurFoil,
            }))}
            index={viewing.index}
            onIndexChange={(index) => {
              setNotice(null);
              setViewing({ list: list.key, index });
            }}
            onClose={() => setViewing(null)}
            info={(vc) => {
              const card = list.cards.find((x) => x.id === vc.key);
              if (!card) return null;
              return (
                <div className="space-y-1 text-sm">
                  {notice && (
                    <p className="rounded-lg bg-emerald-500/15 text-emerald-300 px-3 py-2" aria-live="polite">
                      {notice}
                    </p>
                  )}
                  <p className="text-indigo-300">{list.label}</p>
                  {card.inclusion !== undefined && (
                    <p className="text-zinc-300">
                      In {Math.round(card.inclusion * 100)} % der Decks
                      {card.synergy !== undefined && Math.abs(card.synergy) >= 0.005 && <> · Synergie {card.synergy > 0 ? "+" : "−"}{Math.abs(Math.round(card.synergy * 100))} %</>}
                    </p>
                  )}
                  {card.gameChanger && <p className="text-amber-400">Game Changer</p>}
                  {card.owned > 0 ? (
                    <p className="text-emerald-400">✔ {card.owned}× in deiner Sammlung</p>
                  ) : (
                    <p className="text-zinc-500">Nicht in deiner Sammlung</p>
                  )}
                  {card.inDecks.length > 0 && <p className="text-zinc-400">In Decks: {card.inDecks.join(", ")}</p>}
                  {card.friends.length > 0 && (
                    <p className="text-sky-400">👥 {card.friends.map((f) => f.friendEmail.split("@")[0]).join(", ")}</p>
                  )}
                </div>
              );
            }}
            actions={(vc) => {
              const card = list.cards.find((x) => x.id === vc.key);
              if (!card) return null;
              return (
                <>
                  {targetDeck && card.owned > 0 && !inTargetDeck(card) && (
                    <button onClick={() => addToDeck(card)} disabled={busy === card.name} className={viewerButton.primary}>
                      + Deck
                    </button>
                  )}
                  {card.owned === 0 && !wished.has(card.name) && (
                    <button onClick={() => addToWishlist(card)} disabled={busy === card.name} className={viewerButton.primary}>
                      + Wunschliste
                    </button>
                  )}
                  <a href={edhrecCardLink(card.name)} target="_blank" rel="noreferrer" className={viewerButton.secondary}>
                    EDHREC ↗
                  </a>
                </>
              );
            }}
          />
        );
      })()}
    </main>
  );
}

function CardLine({
  card,
  numDecks,
  onOpen,
  busy,
  canAddToDeck,
  inDeck,
  wished,
  onWishlist,
  onDeck,
}: {
  card: ListCard;
  numDecks: number | null;
  onOpen: () => void;
  busy: boolean;
  canAddToDeck: boolean;
  /** steckt schon im gewählten Deck */
  inDeck: boolean;
  /** gerade auf die Wunschliste gesetzt */
  wished: boolean;
  onWishlist: () => void;
  onDeck: () => void;
}) {
  const pct = card.inclusion !== undefined ? Math.round(card.inclusion * 100) : null;
  const syn = card.synergy !== undefined && Math.abs(card.synergy) >= 0.005 ? Math.round(card.synergy * 100) : null;
  return (
    <li className="flex items-center gap-3 p-2">
      <button type="button" onClick={onOpen} className="press flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`${card.name} ansehen`}>
        <span className="shrink-0 w-9 h-[50px] rounded overflow-hidden bg-white/5">
          {card.image && <Image src={card.image} alt="" width={36} height={50} className="w-full h-full object-cover" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="truncate text-sm font-medium">{card.name}</span>
            {card.gameChanger && <span className="shrink-0 text-[10px] text-amber-400" title="Game Changer">GC</span>}
          </span>
          <span className="block truncate text-xs text-zinc-400 tabular-nums">
            {pct !== null && <>in {pct} % der Decks</>}
            {syn !== null && <span className={syn > 0 ? "text-emerald-400" : "text-rose-400"}> · {syn > 0 ? "+" : "−"}{Math.abs(syn)} % Synergie</span>}
          </span>
          <span className="block truncate text-xs">
            <span className="text-zinc-300 tabular-nums">{card.eur !== null ? formatEur(card.eur) : "–"}</span>
            {card.owned > 0 ? <span className="text-emerald-400"> · ✔ {card.owned}× hast du</span> : <span className="text-zinc-500"> · fehlt dir</span>}
            {card.friends.length > 0 && <span className="text-sky-400"> · 👥 {card.friends.map((f) => f.friendEmail.split("@")[0]).join(", ")}</span>}
          </span>
        </span>
      </button>
      {inDeck ? (
        <span className="shrink-0 text-xs font-medium text-emerald-400">✔ im Deck</span>
      ) : wished ? (
        <span className="shrink-0 text-xs font-medium text-emerald-400">✔ gemerkt</span>
      ) : canAddToDeck && card.owned > 0 ? (
        <button onClick={onDeck} disabled={busy} aria-label={`${card.name} ins Deck`} className="press shrink-0 h-9 rounded-lg px-2.5 text-xs font-medium bg-indigo-500/20 border border-indigo-400/40 text-indigo-100 disabled:opacity-50">
          ＋ Deck
        </button>
      ) : card.owned === 0 ? (
        <button onClick={onWishlist} disabled={busy} aria-label={`${card.name} auf die Wunschliste`} className="press shrink-0 h-9 rounded-lg px-2.5 text-xs font-medium bg-white/[0.06] border border-white/10 text-zinc-200 disabled:opacity-50">
          ＋ Wunsch
        </button>
      ) : null}
    </li>
  );
}

function CardTile({
  card,
  onOpen,
  busy,
  canAddToDeck,
  inDeck,
  wished,
  onWishlist,
  onDeck,
}: {
  card: ListCard;
  onOpen: () => void;
  busy: boolean;
  canAddToDeck: boolean;
  /** steckt schon im gewählten Deck */
  inDeck: boolean;
  /** gerade auf die Wunschliste gesetzt */
  wished: boolean;
  onWishlist: () => void;
  onDeck: () => void;
}) {
  return (
    <li className="surface overflow-hidden flex flex-col">
      <button
        onClick={onOpen}
        aria-label={`${card.name} ansehen`}
        className="block w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
      >
        {card.image ? (
          <Image src={card.image} alt={card.name} width={244} height={340} className="w-full h-auto" />
        ) : (
          <div className="aspect-[244/340] flex items-center justify-center p-2 text-center text-sm text-zinc-500">
            {card.name}
          </div>
        )}
      </button>
      <div className="p-2 space-y-1 text-xs flex-1 flex flex-col">
        <div className="flex justify-between gap-1">
          <span className="text-zinc-300">{card.eur !== null ? formatEur(card.eur) : "–"}</span>
          {card.gameChanger && <span className="text-amber-400" title="Game Changer">GC</span>}
        </div>
        {card.inclusion !== undefined && (
          <p className="text-zinc-300 tabular-nums">
            in {Math.round(card.inclusion * 100)} % der Decks
            {card.synergy !== undefined && Math.abs(card.synergy) >= 0.005 && (
              <span className={`ml-1.5 ${card.synergy > 0 ? "text-emerald-400" : "text-rose-400"}`} title="Synergie: Anteil bei diesem Commander minus Anteil in allen Decks dieser Farben">
                {card.synergy > 0 ? "+" : "−"}
                {Math.abs(Math.round(card.synergy * 100))} %
              </span>
            )}
          </p>
        )}
        {card.owned > 0 ? (
          <p className="text-emerald-400">✔ {card.owned}× in Sammlung</p>
        ) : (
          <p className="text-zinc-500">nicht in Sammlung</p>
        )}
        {card.inDecks.length > 0 && <p className="text-zinc-400 truncate" title={card.inDecks.join(", ")}>in {card.inDecks.join(", ")}</p>}
        {card.friends.length > 0 && (
          <p className="text-sky-400 truncate" title={card.friends.map((f) => f.friendEmail).join(", ")}>
            👥 {card.friends.map((f) => f.friendEmail.split("@")[0]).join(", ")}
          </p>
        )}
        {card.groupDecks > 0 && <p className="text-zinc-400">in {card.groupDecks} Gruppen-Deck(s)</p>}
        <div className="mt-auto pt-1.5">
          {inDeck && <p className="h-8 grid place-items-center rounded-lg bg-emerald-500/10 text-emerald-400 font-medium">✔ im Deck</p>}
          {!inDeck && wished && <p className="h-8 grid place-items-center rounded-lg bg-emerald-500/10 text-emerald-400 font-medium">✔ auf der Wunschliste</p>}
          {!inDeck && canAddToDeck && card.owned > 0 && (
            <button onClick={onDeck} disabled={busy} className="press w-full h-8 rounded-lg bg-indigo-500/20 border border-indigo-400/40 text-indigo-100 font-medium disabled:opacity-50">
              ＋ Deck
            </button>
          )}
          {!inDeck && !wished && card.owned === 0 && (
            <button onClick={onWishlist} disabled={busy} className="press w-full h-8 rounded-lg bg-white/[0.06] border border-white/10 text-zinc-200 font-medium disabled:opacity-50">
              ＋ Wunschliste
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
