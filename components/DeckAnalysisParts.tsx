"use client";

// Bausteine der Deck-Analyse: Tausch-Vergleich, Zusammenspiel, Stimmigkeit.
import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import { formatEur } from "@/lib/format";
import type { DeckHealth, FriendCopy, SwapIn, SwapOut } from "@/lib/deckDoctor";
import { ROLE_LABEL, type CardRole } from "@/lib/cardRoles";
import { edhrecSlug } from "@/lib/edhrec";
import { SwipeSheet } from "@/components/ui/SwipeSheet";
import { EDHREC_LIST, explainIn, explainOut } from "@/lib/swapExplain";
import type { DeckSynergy, PairFit } from "@/lib/deckSynergy";
import { ScoreRing, SourceBadge } from "@/components/discoverShared";

export type Pairs = Record<string, PairFit | "loading">;

const pctLabel = (x: number | null | undefined) => (x == null ? "–" : `${Math.round(x * 100)} %`);

/**
 * Vergleich zum Nachprüfen: raus- und reinkommende Karte groß nebeneinander,
 * darunter die Zahlen, auf denen der Vorschlag beruht (EDHREC-Anteil,
 * Synergie, Rollen, Mana, Preis) plus Links zu EDHREC und Scryfall.
 */
export function SwapCompare({
  items,
  index,
  onIndexChange,
  onClose,
  commander,
  numDecks,
  themes,
  pairs,
  loadPairs,
  health,
  edhrecSlug: slug,
  onTrade,
  actions,
}: {
  /** Knöpfe zum Umsetzen (Tausch übernehmen, Karte behalten …) */
  actions?: (item: { out?: SwapOut; in: SwapIn }) => ReactNode;
  pairs: Pairs;
  loadPairs: (names: string[]) => void;
  items: Array<{ out?: SwapOut; in: SwapIn }>;
  numDecks: number | null;
  themes: string[];
  health: DeckHealth;
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  commander: string;
  edhrecSlug: string | null;
  onTrade: (c: FriendCopy) => void;
}) {
  const [zoom, setZoom] = useState<string | null>(null);
  const item = items[index];
  const outName = item?.out?.name;
  const inName = item?.in.name;
  useEffect(() => {
    if (inName) loadPairs(outName ? [inName, outName] : [inName]);
  }, [inName, outName, loadPairs]);
  if (!item) return null;
  const { out, in: add } = item;
  const pIn = pairs[add.name];
  const pOut = out ? pairs[out.name] : undefined;
  const ready = (p: PairFit | "loading" | undefined): PairFit | null => (p && p !== "loading" ? p : null);
  const pairLabel = (p: PairFit | "loading" | undefined) => (p === undefined || p === "loading" ? "…" : !p.known ? "–" : `${p.partners.length} ${p.partners.length === 1 ? "Karte" : "Karten"}`);
  const roles = (r: CardRole[]) => (r.length ? r.map((x) => ROLE_LABEL[x]).join(", ") : "–");
  type Row = { label: string; out?: string; in: string; better?: "in" | "out" | null };
  const cmp = (a: number | null | undefined, b: number | null | undefined, higherIsBetter = true): "in" | "out" | null => {
    if (a == null || b == null || a === b) return null;
    return (b > a) === higherIsBetter ? "in" : "out";
  };
  const rows: Row[] = [
    { label: "Spielen es", out: out ? (out.inclusion == null ? "kaum" : pctLabel(out.inclusion)) : undefined, in: pctLabel(add.inclusion), better: out ? cmp(out.inclusion ?? 0, add.inclusion) : null },
    {
      label: "Synergie",
      out: out ? (out.synergy == null ? "–" : `${out.synergy >= 0 ? "+" : ""}${Math.round(out.synergy * 100)} %`) : undefined,
      in: `${add.synergy >= 0 ? "+" : ""}${Math.round(add.synergy * 100)} %`,
      better: out ? cmp(out.synergy ?? 0, add.synergy) : null,
    },
    { label: "Grundrolle", out: out ? (out.rolesKnown ? roles(out.roles) : "noch offen") : undefined, in: roles(add.roles) },
    { label: "Thema", out: out ? (out.themes.join(", ") || "–") : undefined, in: add.themes.join(", ") || (EDHREC_LIST[add.list] ? `EDHREC: ${EDHREC_LIST[add.list]}` : "–") },
    { label: "Mana", out: out ? String(out.cmc) : undefined, in: String(add.cmc), better: out ? cmp(out.cmc, add.cmc, false) : null },
    {
      label: "Zusammenspiel",
      out: out ? pairLabel(pOut) : undefined,
      in: pairLabel(pIn),
      better: out && ready(pIn) && ready(pOut) ? cmp(ready(pOut)!.partners.length, ready(pIn)!.partners.length) : null,
    },
    { label: "Preis", out: out ? "im Deck" : undefined, in: add.eur != null ? `≈ ${formatEur(add.eur)}` : "–" },
  ];
  const tone = (side: "in" | "out", r: Row) => (r.better === side ? "text-emerald-300 font-semibold" : "text-zinc-200");
  const scry = (n: string) => `https://scryfall.com/search?q=${encodeURIComponent(`!"${n}"`)}`;

  return (
    <>
    <SwipeSheet
      index={index}
      count={items.length}
      onIndexChange={onIndexChange}
      onClose={onClose}
      title={out ? "Tausch prüfen" : add.name}
      subtitle={out ? `${out.name} → ${add.name}` : "passt zu deinem Deck"}
      label="Tauschvorschlag"
      keyboardDisabled={zoom != null}
    >
      <div className="px-4 pt-3 pb-6 space-y-4">
        <div className={`grid gap-3 ${out ? "grid-cols-2" : "grid-cols-1 max-w-[16rem] mx-auto"}`}>
          {out && <CompareCard tag="Raus" tone="out" name={out.name} image={out.image} typeLine={out.typeLine} onZoom={setZoom} />}
          <CompareCard tag={out ? "Rein" : "Vorschlag"} tone="in" name={add.name} image={add.image} typeLine={add.typeLine} onZoom={setZoom} />
        </div>

        {actions && <div className="grid gap-2">{actions(item)}</div>}

        <div className="rounded-xl bg-white/[0.04] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-zinc-500">
                <th className="text-left font-normal px-3 pt-2">mit {commander}</th>
                {out && <th className="text-right font-normal px-3 pt-2">Raus</th>}
                <th className="text-right font-normal px-3 pt-2">Rein</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-t border-white/[0.05]">
                  <td className="px-3 py-1.5 text-zinc-400">{r.label}</td>
                  {out && <td className={`px-3 py-1.5 text-right tabular-nums ${r.label === "Grundrolle" || r.label === "Thema" ? "" : "whitespace-nowrap"} ${tone("out", r)}`}>{r.out}</td>}
                  <td className={`px-3 py-1.5 text-right tabular-nums ${r.label === "Grundrolle" || r.label === "Thema" ? "" : "whitespace-nowrap"} ${tone("in", r)}`}>{r.in}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className="rounded-xl bg-emerald-500/[0.07] border border-emerald-400/20 p-3 space-y-1.5">
          <h4 className="text-sm font-semibold text-emerald-300">Warum {add.name} rein</h4>
          <ul className="space-y-1 text-[13px] text-zinc-200 list-disc pl-4 marker:text-emerald-400/70">
            {explainIn(add, out, health, { commander, numDecks, themes, pairsIn: ready(pIn), pairsOut: ready(pOut) }).map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </section>
        {out && (
          <section className="rounded-xl bg-red-500/[0.06] border border-red-400/20 p-3 space-y-1.5">
            <h4 className="text-sm font-semibold text-red-300">Warum {out.name} raus</h4>
            <ul className="space-y-1 text-[13px] text-zinc-200 list-disc pl-4 marker:text-red-400/70">
              {explainOut(out, { commander, themes, pairsOut: ready(pOut) }).map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </section>
        )}
        <section className="rounded-xl bg-white/[0.04] p-3 space-y-2">
          <h4 className="text-sm font-semibold">Zusammenspiel mit deinem Deck</h4>
          <PairList label={add.name} tone="in" p={pIn} />
          {out && <PairList label={out.name} tone="out" p={pOut} />}
          <p className="text-[11px] text-zinc-500">
            Laut EDHREC werden diese Karten deines Decks auffällig oft zusammen mit ihr gespielt (×-Wert = wie viel häufiger als zufällig).
          </p>
        </section>
        <p className="text-[11px] text-zinc-500">
          „Spielen es“ = Anteil der EDHREC-Decks mit {commander}, die die Karte enthalten. Synergie = wie viel häufiger sie dort ist als in anderen Decks derselben Farben.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <SourceBadge add={add} onTrade={onTrade} />
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          {slug && (
            <a href={`https://edhrec.com/commanders/${slug}`} target="_blank" rel="noopener noreferrer" className="btn-secondary h-9 px-3">
              EDHREC: {commander} ↗
            </a>
          )}
          <a href={`https://edhrec.com/cards/${edhrecSlug(add.name)}`} target="_blank" rel="noopener noreferrer" className="btn-secondary h-9 px-3">
            EDHREC: {add.name} ↗
          </a>
          {out && (
            <a href={scry(out.name)} target="_blank" rel="noopener noreferrer" className="btn-secondary h-9 px-3">
              Scryfall: {out.name} ↗
            </a>
          )}
          <a href={scry(add.name)} target="_blank" rel="noopener noreferrer" className="btn-secondary h-9 px-3">
            Scryfall: {add.name} ↗
          </a>
        </div>
      </div>
    </SwipeSheet>
      {zoom && (
        <button onClick={() => setZoom(null)} className="fixed inset-0 z-[80] bg-black/85 flex items-center justify-center p-6" aria-label="Großansicht schließen">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom.replace("/normal/", "/large/")} alt="" className="max-h-full max-w-full rounded-[4.75%/3.5%]" />
        </button>
      )}
    </>
  );
}

export function PairList({ label, tone, p }: { label: string; tone: "in" | "out"; p: PairFit | "loading" | undefined }) {
  const head = <p className={`text-xs font-medium ${tone === "in" ? "text-emerald-300" : "text-red-300"}`}>{label}</p>;
  if (p === undefined || p === "loading")
    return (
      <div>
        {head}
        <p className="text-xs text-zinc-500 animate-pulse">Frage EDHREC …</p>
      </div>
    );
  if (!p.known)
    return (
      <div>
        {head}
        <p className="text-xs text-zinc-500">Keine Daten bei EDHREC – wird zu selten gespielt.</p>
      </div>
    );
  return (
    <div className="space-y-1">
      {head}
      {p.partners.length ? (
        <div className="flex flex-wrap gap-1">
          {p.partners.slice(0, 12).map((x) => (
            <span key={x.name} className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[11px]">
              {x.name} <span className="text-zinc-400 tabular-nums">×{x.lift.toFixed(1).replace(".", ",")}</span>
            </span>
          ))}
          {p.partners.length > 12 && <span className="text-[11px] text-zinc-500">+{p.partners.length - 12} weitere</span>}
        </div>
      ) : (
        <p className="text-xs text-zinc-400">Mit keiner deiner Karten auffällig oft zusammen.</p>
      )}
    </div>
  );
}

export function SynergyPanel({ syn, commander, strategy }: { syn: DeckSynergy; commander: string; strategy: string | null }) {
  const tone = syn.score >= 70 ? "good" : syn.score >= 50 ? "ok" : "bad";
  const maxTheme = Math.max(1, ...syn.themes.map((t) => t.count));
  return (
    <section className="rounded-xl bg-white/[0.04] p-3 space-y-2.5">
      <div className="flex items-center gap-3">
        <ScoreRing score={syn.score} tone={tone} />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Stimmigkeit</h3>
          <p className="text-xs text-zinc-400">
            {syn.listed} von {syn.total} Karten sind typisch für {commander}
            {strategy ? ` (${strategy})` : ""} · Ø Synergie {syn.avgSynergy >= 0 ? "+" : ""}
            {Math.round(syn.avgSynergy * 100)} % · {syn.highSynergy} Karten gezielt für diesen Commander
          </p>
        </div>
      </div>
      {syn.themes.some((t) => t.count > 0) && (
        <div className="space-y-1">
          <p className="text-[11px] text-zinc-400">Karten je Thema</p>
          {syn.themes.map((t) => (
            <div key={t.name} className="grid grid-cols-[6.5rem_1fr_2rem] items-center gap-2 text-xs">
              <span className="truncate text-zinc-300">{t.name}</span>
              <span className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <span className="block h-full rounded-full bg-indigo-400/80" style={{ width: `${(t.count / maxTheme) * 100}%` }} />
              </span>
              <span className="text-right tabular-nums text-zinc-400">{t.count}</span>
            </div>
          ))}
          <p className="text-[10px] text-zinc-500">gezählt über Kreaturentyp und Kartentext – abstrakte Themen (z. B. Aggro) erkennt das nicht</p>
        </div>
      )}
      {syn.outliers.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs text-zinc-300">Passen am wenigsten ({syn.outliers.length})</summary>
          <ul className="mt-1.5 flex flex-wrap gap-1">
            {syn.outliers.map((o) => (
              <li key={o.name} className="rounded-full bg-red-500/10 text-red-200 px-2 py-0.5 text-[11px]">
                {o.name} <span className="text-zinc-400">{o.synergy == null ? "nicht gelistet" : `${Math.round(o.synergy * 100)} %`}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

export function CompareCard({
  tag,
  tone,
  name,
  image,
  typeLine,
  onZoom,
}: {
  tag: string;
  tone: "in" | "out";
  name: string;
  image: string | null;
  typeLine: string | null;
  onZoom: (src: string) => void;
}) {
  return (
    <figure className="min-w-0 space-y-1.5">
      <figcaption className={`text-xs font-semibold ${tone === "in" ? "text-emerald-300" : "text-red-300"}`}>
        {tone === "in" ? "+" : "−"} {tag}
      </figcaption>
      <button
        onClick={() => image && onZoom(image)}
        className={`block w-full aspect-[488/680] rounded-[4.75%/3.5%] overflow-hidden bg-zinc-800 ring-2 ${tone === "in" ? "ring-emerald-400/50" : "ring-red-400/40 opacity-90"}`}
        aria-label={`${name} groß anzeigen`}
      >
        {image ? (
          <Image src={image} alt={name} width={488} height={680} className="w-full h-full object-cover" sizes="(max-width: 640px) 45vw, 240px" />
        ) : (
          <span className="flex h-full items-center justify-center p-2 text-center text-xs text-zinc-400">{name}</span>
        )}
      </button>
      <p className="text-[11px] text-zinc-500 truncate">{typeLine}</p>
    </figure>
  );
}

