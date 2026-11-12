"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { selectAll } from "@/lib/supabase/selectAll";
import { formatEur } from "@/lib/format";
import {
  addToBasket,
  basketCount,
  basketPayload,
  basketValue,
  setBasketQty,
  type Basket,
  type BasketCard,
} from "@/lib/tradeBasket";

// Trade direkt aus der geteilten Sammlung zusammenstellen: links, was man
// vom Freund bekommt (aus seiner Sammlung ausgewählt), rechts, was man aus
// der eigenen Sammlung dafür gibt – mit Wertbilanz und Notiz.

const COLS = "id, name, name_de, image_url, foil, quantity, price_eur, price_eur_foil, set_code";

export function TradeComposer({
  partner,
  receive,
  onReceiveChange,
  onClose,
  onSent,
}: {
  partner: { id: string; name: string };
  receive: Basket;
  onReceiveChange: (b: Basket) => void;
  onClose: () => void;
  onSent: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [give, setGive] = useState<Basket>([]);
  const [mine, setMine] = useState<Array<BasketCard & { name_de?: string | null }> | null>(null);
  const [mineError, setMineError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Eigene Sammlung erst laden, wenn man etwas dafür geben möchte
  async function loadMine() {
    if (mine || mineError) return;
    try {
      setMine(await selectAll<BasketCard>(() => supabase.from("cards").select(COLS).order("name").order("id")));
    } catch {
      setMineError("Deine Sammlung konnte nicht geladen werden.");
    }
  }

  // Escape schließt (nicht während des Sendens)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !sending && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sending, onClose]);

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!mine || q.length < 2) return [];
    return mine
      .filter((c) => c.name.toLowerCase().includes(q) || (c as { name_de?: string | null }).name_de?.toLowerCase().includes(q))
      .slice(0, 8);
  }, [mine, search]);

  const getValue = basketValue(receive);
  const giveValue = basketValue(give);
  const diff = Math.round((getValue - giveValue) * 100) / 100;

  async function send() {
    setSending(true);
    setError(null);
    const res = await fetch("/api/trades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        partnerId: partner.id,
        receiveCards: basketPayload(receive),
        giveCards: basketPayload(give),
        note,
      }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setSending(false);
    if (!res?.ok) {
      setError(data?.error ?? "Trade konnte nicht gesendet werden.");
      return;
    }
    setSent(true);
    onSent();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/75" role="dialog" aria-modal="true" aria-label={`Trade mit ${partner.name}`} onClick={() => !sending && onClose()}>
      <div
        className="w-full sm:max-w-2xl max-h-[92dvh] flex flex-col rounded-t-[2rem] sm:rounded-3xl bg-zinc-900 border border-white/10 pb-[env(safe-area-inset-bottom)] animate-[sheet_280ms_cubic-bezier(.2,.8,.2,1)] sm:animate-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 pt-2.5 pb-3 border-b border-white/[0.06]">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-white/15 sm:hidden" aria-hidden />
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold truncate">Trade mit {partner.name}</h2>
              <p className="text-xs text-zinc-500">Dein Freund bestätigt den Tausch in „Trades“.</p>
            </div>
            <button onClick={onClose} disabled={sending} aria-label="Schließen" className="icon-btn w-9 h-9 shrink-0">
              ✕
            </button>
          </div>
        </div>

        {sent ? (
          <div className="p-6 text-center space-y-4">
            <div className="mx-auto grid place-items-center w-14 h-14 rounded-full bg-emerald-500/20 text-2xl">✓</div>
            <div>
              <p className="text-lg font-semibold">Trade an {partner.name} geschickt</p>
              <p className="text-sm text-zinc-400">Sobald {partner.name} annimmt, werden die Karten in beiden Sammlungen umgebucht.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Link href="/trades" className="btn-primary">
                Zu den Trades
              </Link>
              <button onClick={onClose} className="btn-secondary">
                Weiter stöbern
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-y-auto px-4 py-4 space-y-5">
              {/* Du bekommst */}
              <section className="space-y-2">
                <h3 className="flex items-baseline justify-between text-sm font-semibold">
                  <span className="text-indigo-300">Du bekommst</span>
                  <span className="text-xs font-normal text-zinc-400 tabular-nums">
                    {basketCount(receive)} {basketCount(receive) === 1 ? "Karte" : "Karten"} · {formatEur(getValue)}
                  </span>
                </h3>
                {receive.length === 0 ? (
                  <p className="surface p-3 text-sm text-zinc-400">Noch nichts gewählt – im Kartendetail „Zum Trade“ antippen.</p>
                ) : (
                  <ul className="surface divide-y divide-white/5 overflow-hidden">
                    {receive.map((b) => (
                      <Row key={b.card.id} item={b} onQty={(q) => onReceiveChange(setBasketQty(receive, b.card.id, q))} />
                    ))}
                  </ul>
                )}
              </section>

              {/* Du gibst */}
              <section className="space-y-2">
                <h3 className="flex items-baseline justify-between text-sm font-semibold">
                  <span className="text-emerald-300">Du gibst dafür</span>
                  <span className="text-xs font-normal text-zinc-400 tabular-nums">
                    {basketCount(give)} {basketCount(give) === 1 ? "Karte" : "Karten"} · {formatEur(giveValue)}
                  </span>
                </h3>
                {give.length > 0 && (
                  <ul className="surface divide-y divide-white/5 overflow-hidden">
                    {give.map((b) => (
                      <Row key={b.card.id} item={b} onQty={(q) => setGive((g) => setBasketQty(g, b.card.id, q))} />
                    ))}
                  </ul>
                )}
                <input
                  type="search"
                  value={search}
                  onFocus={() => void loadMine()}
                  onChange={(e) => {
                    void loadMine();
                    setSearch(e.target.value);
                  }}
                  placeholder="Karte aus deiner Sammlung suchen …"
                  aria-label="Eigene Karte für den Trade suchen"
                  className="input"
                />
                {mineError && <p className="text-sm text-red-400">{mineError}</p>}
                {search.trim().length >= 2 && !mine && !mineError && <p className="text-sm text-zinc-500">Lade deine Sammlung …</p>}
                {results.length > 0 && (
                  <ul className="rounded-xl border border-white/10 divide-y divide-white/5 overflow-hidden">
                    {results.map((c) => (
                      <li key={c.id}>
                        <button
                          onClick={() => {
                            setGive((g) => addToBasket(g, [c]));
                            setSearch("");
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-white/5"
                        >
                          <Thumb card={c} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{c.name}</span>
                            <span className="block text-xs text-zinc-500">
                              <span className="uppercase">{c.set_code}</span>
                              {c.foil && <span className="text-fuchsia-300"> · Foil</span>} · {c.quantity}× vorhanden
                            </span>
                          </span>
                          <span className="text-indigo-300 text-lg" aria-hidden>
                            +
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {search.trim().length >= 2 && mine && results.length === 0 && <p className="text-sm text-zinc-500">Keine passende Karte in deiner Sammlung.</p>}
              </section>

              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notiz an deinen Freund (optional)" maxLength={500} className="input" />
            </div>

            {/* Bilanz + Senden */}
            <div className="border-t border-white/[0.06] px-4 pt-3 pb-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">Wertbilanz für dich</span>
                <span className={`font-semibold tabular-nums ${diff > 0 ? "text-emerald-400" : diff < 0 ? "text-amber-300" : "text-zinc-200"}`}>
                  {diff > 0 ? "+" : ""}
                  {formatEur(diff)}
                </span>
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <button onClick={() => void send()} disabled={sending || (!receive.length && !give.length)} className="btn-primary w-full">
                {sending ? "Sende …" : `Trade an ${partner.name} vorschlagen`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Thumb({ card }: { card: BasketCard }) {
  return (
    <span className="relative shrink-0 w-9 h-[3.2rem] rounded-[4px] overflow-hidden bg-zinc-800">
      {card.image_url && <Image src={card.image_url} alt="" width={36} height={50} className="w-full h-full object-cover" />}
      {card.foil && <span className="absolute inset-0 bg-gradient-to-tr from-fuchsia-500/30 via-transparent to-cyan-300/30" aria-hidden />}
    </span>
  );
}

function Row({ item, onQty }: { item: Basket[number]; onQty: (q: number) => void }) {
  const { card, qty } = item;
  const unit = (card.foil ? card.price_eur_foil ?? card.price_eur : card.price_eur) ?? null;
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <Thumb card={card} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{card.name}</span>
        <span className="block text-xs text-zinc-500">
          <span className="uppercase">{card.set_code}</span>
          {card.foil && <span className="text-fuchsia-300"> · Foil</span>} · {unit != null ? formatEur(unit) : "–"}
        </span>
      </span>
      <span className="flex items-center gap-1 rounded-full bg-black/30 p-1 shrink-0">
        <button onClick={() => onQty(qty - 1)} aria-label={qty === 1 ? `${card.name} entfernen` : `${card.name} weniger`} className="grid place-items-center w-7 h-7 rounded-full bg-white/10 text-sm">
          {qty === 1 ? "✕" : "−"}
        </button>
        <span className="w-6 text-center text-sm tabular-nums" aria-label="Anzahl">
          {qty}
        </span>
        <button
          onClick={() => onQty(qty + 1)}
          disabled={qty >= card.quantity}
          aria-label={`${card.name} mehr`}
          className="grid place-items-center w-7 h-7 rounded-full bg-white/10 text-sm disabled:opacity-30"
        >
          +
        </button>
      </span>
    </li>
  );
}
