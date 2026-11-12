"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import { formatEur } from "@/lib/format";
import { ManaCost, RarityDot } from "@/components/ui/Mana";
import { SwipeSheet } from "@/components/ui/SwipeSheet";

// Kartendetail zum Durchwischen für alle Kartenlisten außerhalb der eigenen
// Sammlung (Deck, Wunschliste, geteilte Sammlung, Sets, Empfehlungen ...).
// Zeigt, was die Seite mitliefert; fehlen Typzeile/Kartentext, werden sie
// bei Scryfall nachgeladen. Seitenspezifische Aktionen kommen über `actions`.

export type ViewerCard = {
  key: string;
  name: string;
  name_de?: string | null;
  image_url: string | null;
  type_line?: string | null;
  mana_cost?: string | null;
  oracle_text?: string | null;
  set_code?: string | null;
  collector_number?: string | null;
  rarity?: string | null;
  price_eur?: number | null;
  price_eur_foil?: number | null;
  foil?: boolean;
  quantity?: number;
};

type Details = Pick<ViewerCard, "type_line" | "mana_cost" | "oracle_text" | "set_code" | "collector_number" | "rarity">;

// Nachgeladene Kartendaten für die Sitzung merken (Scryfall bittet um
// sparsame Abfragen).
const detailCache = new Map<string, Details | null>();

async function fetchDetails(card: ViewerCard): Promise<Details | null> {
  const url =
    card.set_code && card.collector_number
      ? `https://api.scryfall.com/cards/${encodeURIComponent(card.set_code.toLowerCase())}/${encodeURIComponent(card.collector_number)}`
      : `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(card.name)}`;
  if (detailCache.has(url)) return detailCache.get(url)!;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const d = await res.json();
    const face = d.card_faces?.[0];
    const details: Details = {
      type_line: d.type_line ?? face?.type_line ?? null,
      mana_cost: d.mana_cost || face?.mana_cost || null,
      oracle_text:
        d.oracle_text ??
        (d.card_faces as { name: string; oracle_text?: string }[] | undefined)
          ?.map((f) => `${f.name}\n${f.oracle_text ?? ""}`)
          .join("\n\n") ??
        null,
      set_code: d.set ?? null,
      collector_number: d.collector_number ?? null,
      rarity: d.rarity ?? null,
    };
    detailCache.set(url, details);
    return details;
  } catch {
    detailCache.set(url, null);
    return null;
  }
}

export function CardViewer({
  cards,
  index,
  onIndexChange,
  onClose,
  actions,
  info,
  keyboardDisabled = false,
}: {
  cards: ViewerCard[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  /** Knöpfe der jeweiligen Seite, z. B. "Aus Deck entfernen" */
  actions?: (card: ViewerCard) => ReactNode;
  /** Zusatzinfos der Seite, z. B. "Max hat sie" */
  info?: (card: ViewerCard) => ReactNode;
  /** z. B. solange ein Dialog darüber offen ist */
  keyboardDisabled?: boolean;
}) {
  const card = cards[index];
  const [fullscreen, setFullscreen] = useState(false);
  const [details, setDetails] = useState<Details | null>(null);

  const needsDetails = card ? !card.type_line || card.oracle_text == null : false;
  useEffect(() => {
    setDetails(null);
    if (!card || !needsDetails) return;
    let cancelled = false;
    fetchDetails(card).then((d) => {
      if (!cancelled) setDetails(d);
    });
    return () => {
      cancelled = true;
    };
  }, [card?.key]);

  if (!card) return null;
  // Mitgelieferte Daten haben Vorrang, Scryfall füllt nur Lücken.
  const c: ViewerCard = {
    ...card,
    type_line: card.type_line || details?.type_line,
    mana_cost: card.mana_cost || details?.mana_cost,
    oracle_text: card.oracle_text ?? details?.oracle_text,
    set_code: card.set_code || details?.set_code,
    // Nummer nur übernehmen, wenn sie zum selben Druck gehört.
    collector_number:
      card.collector_number ||
      (!card.set_code || card.set_code.toLowerCase() === details?.set_code ? details?.collector_number : null),
    rarity: card.rarity || details?.rarity,
  };
  const setCode = c.set_code;

  return (
    <>
      <SwipeSheet
        index={index}
        count={cards.length}
        onIndexChange={onIndexChange}
        onClose={onClose}
        title={c.name}
        subtitle={c.name_de || undefined}
        label={`${c.name} – Details`}
        keyboardDisabled={fullscreen || keyboardDisabled}
      >
        <div className="px-4 pt-3 pb-4 sm:p-4 grid gap-4 sm:gap-5 sm:grid-cols-[minmax(0,260px)_1fr]">
          <div className="mx-auto w-[78%] max-w-[300px] sm:w-full sm:max-w-none">
            {c.image_url ? (
              <button
                onClick={() => setFullscreen(true)}
                aria-label={`${c.name} groß anzeigen`}
                className="relative block w-full rounded-[4.75%/3.5%] overflow-hidden shadow-xl shadow-black/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              >
                <Image src={c.image_url} alt={c.name} width={488} height={680} className="w-full h-auto" />
                {c.foil && (
                  <span className="absolute inset-0 bg-gradient-to-tr from-fuchsia-500/20 via-transparent to-cyan-300/25 mix-blend-screen" aria-hidden />
                )}
                {c.quantity != null && c.quantity > 1 && (
                  <span className="absolute top-2 right-2 bg-black/80 text-white text-xs font-semibold rounded-md px-2 py-0.5 ring-1 ring-white/10">
                    ×{c.quantity}
                  </span>
                )}
              </button>
            ) : (
              <div className="aspect-[244/340] rounded-xl bg-zinc-800 grid place-items-center text-zinc-500 text-sm p-3 text-center">
                {c.name}
              </div>
            )}
          </div>

          <div className="space-y-4 min-w-0">
            <div className="space-y-1.5">
              {(c.type_line || c.mana_cost) && (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-zinc-300">{c.type_line}</p>
                  <ManaCost cost={c.mana_cost} />
                </div>
              )}
              {(setCode || c.rarity) && (
                <p className="flex items-center gap-1.5 text-xs text-zinc-500">
                  <RarityDot rarity={c.rarity} />
                  <span className="uppercase">{setCode}</span>
                  {c.collector_number && <span>#{c.collector_number}</span>}
                  {c.rarity && <span className="capitalize">· {c.rarity}</span>}
                  {c.foil && <span className="text-fuchsia-300">· Foil</span>}
                </p>
              )}
              {c.oracle_text ? (
                <p className="text-sm text-zinc-300 whitespace-pre-line rounded-xl bg-white/5 px-3 py-2 leading-relaxed">
                  {c.oracle_text}
                </p>
              ) : needsDetails && details == null ? (
                <p className="h-16 rounded-xl bg-white/5 animate-pulse" aria-label="Kartendaten werden geladen" />
              ) : null}
            </div>

            {(c.price_eur != null || c.price_eur_foil != null) && (
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className={`rounded-xl px-2 py-2 border ${!c.foil ? "bg-white/10 border-white/20" : "bg-white/5 border-transparent"}`}>
                  <p className="text-sm font-semibold tabular-nums">{c.price_eur != null ? formatEur(c.price_eur) : "–"}</p>
                  <p className="text-[11px] text-zinc-500">Normal</p>
                </div>
                <div className={`rounded-xl px-2 py-2 border ${c.foil ? "bg-white/10 border-white/20" : "bg-white/5 border-transparent"}`}>
                  <p className="text-sm font-semibold tabular-nums">{c.price_eur_foil != null ? formatEur(c.price_eur_foil) : "–"}</p>
                  <p className="text-[11px] text-zinc-500">Foil</p>
                </div>
              </div>
            )}

            {info && info(card)}

            {actions && <div className="flex flex-wrap gap-2">{actions(card)}</div>}

            <div className="flex flex-wrap gap-2 text-sm">
              <a
                href={`https://www.cardmarket.com/de/Magic/Products/Search?searchString=${encodeURIComponent(c.name)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-white/5 border border-white/10 hover:border-white/20 px-3 py-1.5"
              >
                Cardmarket ↗
              </a>
              <a
                href={
                  setCode && c.collector_number
                    ? `https://scryfall.com/card/${setCode.toLowerCase()}/${encodeURIComponent(c.collector_number)}`
                    : `https://scryfall.com/search?q=${encodeURIComponent(`!"${c.name}"`)}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-white/5 border border-white/10 hover:border-white/20 px-3 py-1.5"
              >
                Scryfall ↗
              </a>
            </div>
          </div>
        </div>
      </SwipeSheet>

      {fullscreen && c.image_url && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Großansicht: ${c.name}`}
          className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-6"
          onClick={() => setFullscreen(false)}
        >
          <div className="max-w-xs w-full">
            <Image
              src={c.image_url.replace("/normal/", "/large/")}
              alt={c.name}
              width={488}
              height={680}
              className="w-full h-auto rounded-xl shadow-2xl"
            />
            <p className="text-center text-sm text-zinc-400 mt-3">Tippen zum Schließen</p>
          </div>
        </div>
      )}
    </>
  );
}

/** Knopf-Stil für Aktionen im Viewer. */
export const viewerButton = {
  primary: "rounded-xl bg-indigo-500 hover:bg-indigo-400 px-4 py-2 text-sm font-medium disabled:opacity-50",
  secondary: "rounded-xl bg-white/5 border border-white/10 hover:border-white/20 px-4 py-2 text-sm disabled:opacity-50",
  danger: "rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 px-4 py-2 text-sm disabled:opacity-50",
};
