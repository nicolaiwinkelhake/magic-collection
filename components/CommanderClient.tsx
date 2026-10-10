"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { filterCards, type ListCard, type ListFilters } from "@/lib/commanderLists";
import { edhrecCardLink } from "@/lib/edhrecLinks";
import { formatEur } from "@/lib/format";
import type { CommanderTheme } from "@/lib/commanderProfile";

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
};

const COLOR_NAME: Record<string, string> = { W: "Weiß", U: "Blau", B: "Schwarz", R: "Rot", G: "Grün" };

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

  useEffect(() => {
    const params = new URLSearchParams({ name });
    if (partner) params.set("partner", partner);
    setData(null);
    setError(null);
    fetch(`/api/commanders/overview?${params}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error ?? `Fehler ${r.status}`);
        setData(d);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Unbekannter Fehler"));
  }, [name, partner]);

  const lists = useMemo(
    () => (data?.lists ?? []).map((l) => ({ ...l, cards: filterCards(l.cards, filters) })),
    [data, filters]
  );

  async function addToWishlist(card: ListCard) {
    setBusy(card.name);
    const res = await fetch("/api/wishlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ names: card.name }),
    });
    setBusy(null);
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
          Lade Empfehlungen für {name}… Beim ersten Aufruf eines Commanders werden Themen und Kartenlisten ermittelt
          (bis zu einer Minute), danach geht es schnell.
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
            {c.rank && <> · Beliebtheitsrang #{c.rank.toLocaleString("de-DE")} (Scryfall)</>}
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

      {data.themes.length > 0 && (
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

      <section className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur border-y border-zinc-800 py-3 flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          Budget je Karte
          <select
            value={filters.maxPrice ?? ""}
            onChange={(e) => setFilters({ ...filters, maxPrice: e.target.value ? Number(e.target.value) : null })}
            className="rounded bg-zinc-800 px-2 py-1"
          >
            <option value="">egal</option>
            <option value="1">bis 1 €</option>
            <option value="5">bis 5 €</option>
            <option value="15">bis 15 €</option>
            <option value="40">bis 40 €</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={filters.noGameChangers}
            onChange={(e) => setFilters({ ...filters, noGameChangers: e.target.checked })}
          />
          Ohne Game Changer (Bracket 1–2)
        </label>
        <div className="flex rounded overflow-hidden border border-zinc-700" role="group" aria-label="Besitz">
          {(["all", "owned", "missing"] as const).map((o) => (
            <button
              key={o}
              onClick={() => setFilters({ ...filters, ownership: o })}
              className={`px-2 py-1 ${filters.ownership === o ? "bg-indigo-600" : "bg-zinc-800 hover:bg-zinc-700"}`}
            >
              {o === "all" ? "Alle" : o === "owned" ? "Besitze ich" : "Fehlen mir"}
            </button>
          ))}
        </div>
        {decks.length > 0 && (
          <label className="flex items-center gap-2 ml-auto">
            Ziel-Deck
            <select value={targetDeck} onChange={(e) => setTargetDeck(e.target.value)} className="rounded bg-zinc-800 px-2 py-1">
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      {notice && (
        <p className="text-sm text-emerald-300" aria-live="polite">
          {notice}
        </p>
      )}

      {lists.map((list) => (
        <section key={list.key} id={list.key} className="space-y-2 scroll-mt-20">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-medium text-lg">{list.label}</h2>
            <span className="text-xs text-zinc-500">
              {list.cards.filter((x) => x.owned > 0).length} von {list.cards.length} in deiner Sammlung
            </span>
          </div>
          {list.description && <p className="text-sm text-zinc-400">{list.description}</p>}
          {list.cards.length === 0 ? (
            <p className="text-sm text-zinc-500">Keine Karten für die aktuellen Filter.</p>
          ) : (
            <ul className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {list.cards.map((card) => (
                <CardTile
                  key={card.id}
                  card={card}
                  busy={busy === card.name}
                  canAddToDeck={Boolean(targetDeck)}
                  onWishlist={() => addToWishlist(card)}
                  onDeck={() => addToDeck(card)}
                />
              ))}
            </ul>
          )}
        </section>
      ))}

      {data.combos.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium text-lg">Combos mit {c.name}</h2>
          <ul className="space-y-2 text-sm">
            {data.combos.map((combo) => (
              <li key={combo.id} className="rounded-md bg-zinc-900 border border-zinc-800 px-3 py-2">
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
    </main>
  );
}

function CardTile({
  card,
  busy,
  canAddToDeck,
  onWishlist,
  onDeck,
}: {
  card: ListCard;
  busy: boolean;
  canAddToDeck: boolean;
  onWishlist: () => void;
  onDeck: () => void;
}) {
  return (
    <li className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden flex flex-col">
      <a href={edhrecCardLink(card.name)} target="_blank" rel="noreferrer" title={`${card.name} auf EDHREC`}>
        {card.image ? (
          <Image src={card.image} alt={card.name} width={244} height={340} className="w-full h-auto" />
        ) : (
          <div className="aspect-[244/340] flex items-center justify-center p-2 text-center text-sm text-zinc-500">
            {card.name}
          </div>
        )}
      </a>
      <div className="p-2 space-y-1 text-xs flex-1 flex flex-col">
        <div className="flex justify-between gap-1">
          <span className="text-zinc-300">{card.eur !== null ? formatEur(card.eur) : "–"}</span>
          {card.gameChanger && <span className="text-amber-400" title="Game Changer">GC</span>}
        </div>
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
        <div className="mt-auto flex gap-2 pt-1">
          {canAddToDeck && card.owned > 0 && (
            <button onClick={onDeck} disabled={busy} className="text-indigo-400 hover:underline disabled:opacity-50">
              + Deck
            </button>
          )}
          {card.owned === 0 && (
            <button onClick={onWishlist} disabled={busy} className="text-indigo-400 hover:underline disabled:opacity-50">
              + Wunschliste
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
