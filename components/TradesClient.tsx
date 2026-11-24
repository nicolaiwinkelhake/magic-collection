"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatEur, formatDate } from "@/lib/format";
import Image from "next/image";
import { PageHeader } from "@/components/ui/PageHeader";
import { CardViewer, type ViewerCard } from "@/components/ui/CardViewer";
import { myDeckUses, ownedFor, ownedText, type OwnIndex } from "@/lib/ownedMatch";
import { useMyCollection, type MyDecks } from "@/lib/useMyCollection";
import { basketCount, basketValue, loadDrafts, saveDrafts, withDraft, type TradeDrafts } from "@/lib/tradeBasket";
import { haptic } from "@/lib/haptics";

type TradeItem = {
  name: string;
  image_url: string | null;
  foil: boolean;
  quantity: number;
  price: number | null;
  from_user_id: string;
  scryfall_id?: string | null;
  id?: string;
};

type Trade = {
  id: string;
  status: "pending" | "accepted" | "declined" | "cancelled";
  note: string | null;
  created_at: string;
  resolved_at: string | null;
  proposer_id: string;
  partner_id: string;
  proposer_email: string;
  partner_email: string;
  i_am_proposer: boolean;
  items: TradeItem[];
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Offen",
  accepted: "Angenommen",
  declined: "Abgelehnt",
  cancelled: "Zurückgezogen",
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-900/40 text-amber-300 border-amber-800",
  accepted: "bg-emerald-900/40 text-emerald-300 border-emerald-800",
  declined: "bg-red-900/40 text-red-300 border-red-800",
  cancelled: "bg-zinc-800 text-zinc-400 border-zinc-700",
};

export function TradesClient({
  currentUserId,
  trades,
  friends,
}: {
  currentUserId: string;
  trades: Trade[];
  friends: string[];
}) {
  const router = useRouter();
  // eigene Sammlung: zeigt bei Karten, die man bekommt, ob man sie schon hat
  const mine = useMyCollection();
  const [partnerEmail, setPartnerEmail] = useState(friends[0] ?? "");
  const [give, setGive] = useState("");
  const [receive, setReceive] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  async function submitTrade(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const res = await fetch("/api/trades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partnerEmail, give, receive, note }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      haptic("error");
      setMessage(`Fehler: ${data.error}`);
      return;
    }

    haptic("success");
    setGive("");
    setReceive("");
    setNote("");
    setMessage(
      data.notFound?.length
        ? `Trade vorgeschlagen. Nicht gefunden: ${data.notFound.join(", ")}`
        : "Trade vorgeschlagen."
    );
    router.refresh();
  }

  async function respond(id: string, action: "accept" | "decline" | "remove_item", extra: { itemIds?: string[]; itemId?: string } = {}) {
    const res = await fetch(`/api/trades/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const data = await res.json();
    if (!res.ok) {
      haptic("error");
      setMessage(`Fehler: ${data.error}`);
      return;
    }
    haptic(action === "accept" ? "success" : "tap");
    router.refresh();
  }

  return (
    <main className="page max-w-3xl">
      <PageHeader title="Trades" subtitle="Karten mit Freunden tauschen" />
      <TradeDraftList />

      {/* Neuer Trade */}
      <div className="surface p-4">
        <button onClick={() => setFormOpen(!formOpen)} aria-expanded={formOpen} className="w-full flex items-center gap-3 text-left font-medium">
          <span className="grid place-items-center w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 shadow-glow text-lg leading-none" aria-hidden>
            {formOpen ? "−" : "+"}
          </span>
          <span className="flex-1">Neuen Trade vorschlagen</span>
          <span className={`text-zinc-500 transition ${formOpen ? "rotate-180" : ""}`} aria-hidden>▾</span>
        </button>

        {formOpen && (
          <form onSubmit={submitTrade} className="mt-3 space-y-3">
            {friends.length === 0 ? (
              <p className="text-sm text-zinc-400">
                Du brauchst zuerst einen bestätigten Freund.{" "}
                <Link href="/friends" className="text-indigo-400 hover:underline">
                  Freund hinzufügen
                </Link>
              </p>
            ) : (
              <>
                <div className="space-y-1">
                  <label className="text-sm text-zinc-400">Handelspartner</label>
                  <select
                    value={partnerEmail}
                    onChange={(e) => setPartnerEmail(e.target.value)}
                    className="input"
                  >
                    {friends.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-sm text-emerald-400">
                      Ich gebe ab
                    </label>
                    <textarea
                      value={give}
                      onChange={(e) => setGive(e.target.value)}
                      rows={4}
                      placeholder={"1x Sol Ring\nArcane Signet"}
                      className="input font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm text-indigo-400">
                      Ich bekomme
                    </label>
                    <textarea
                      value={receive}
                      onChange={(e) => setReceive(e.target.value)}
                      rows={4}
                      placeholder={"Cyclonic Rift"}
                      className="input font-mono text-sm"
                    />
                  </div>
                </div>

                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Notiz (optional)"
                  className="input text-sm"
                />

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary"
                >
                  {loading ? "Sende..." : "Trade vorschlagen"}
                </button>
              </>
            )}
          </form>
        )}
        {message && <p className="text-sm text-zinc-300 mt-2">{message}</p>}
      </div>

      {/* Historie */}
      <section className="space-y-4">
        <h2 className="font-medium text-zinc-300">Verlauf</h2>
        {trades.length === 0 ? (
          <p className="text-zinc-500 text-sm">Noch keine Trades.</p>
        ) : (
          trades.map((trade) => (
            <TradeCard
              key={trade.id}
              trade={trade}
              currentUserId={currentUserId}
              onRespond={respond}
              own={mine.own}
              myDecks={mine.myDecks}
            />
          ))
        )}
      </section>
    </main>
  );
}

function TradeCard({
  trade,
  currentUserId,
  onRespond,
  own,
  myDecks,
}: {
  trade: Trade;
  currentUserId: string;
  onRespond: (id: string, action: "accept" | "decline" | "remove_item", extra?: { itemIds?: string[]; itemId?: string }) => void;
  own: OwnIndex | null;
  myDecks: MyDecks | null;
}) {
  const myItems = trade.items.filter((i) => i.from_user_id === currentUserId);
  const theirItems = trade.items.filter((i) => i.from_user_id !== currentUserId);
  // Offener Trade: Anfragender kann einzelne Karten entfernen, der Partner
  // wählt, welche Karten er annimmt (anfangs alle).
  const pending = trade.status === "pending";
  const canPick = pending && trade.partner_id === currentUserId && trade.items.every((i) => i.id);
  const canRemove = pending && trade.proposer_id === currentUserId && trade.items.every((i) => i.id);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(trade.items.map((i) => i.id ?? "")));
  const isPicked = (i: TradeItem) => !canPick || picked.has(i.id ?? "");
  const togglePick = (i: TradeItem) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(i.id!)) n.delete(i.id!);
      else n.add(i.id!);
      return n;
    });
  const pickedCount = trade.items.filter(isPicked).length;
  const [busyItem, setBusyItem] = useState<string | null>(null);
  async function removeItem(i: TradeItem) {
    const last = trade.items.length === 1;
    if (!confirm(last ? `„${i.name}“ entfernen? Es ist die letzte Karte – der Trade wird damit zurückgezogen.` : `„${i.name}“ aus dem Trade entfernen?`)) return;
    setBusyItem(i.id!);
    await onRespond(trade.id, "remove_item", { itemId: i.id });
    setBusyItem(null);
  }
  // Kartendetail: antippen zeigt Bild, Set und Nummer zum Raussuchen
  const [viewing, setViewing] = useState<number | null>(null);
  const ordered = [...myItems, ...theirItems];
  const viewerCards: ViewerCard[] = ordered.map((i, idx) => ({
    key: `${idx}-${i.scryfall_id ?? i.name}`,
    name: i.name,
    image_url: i.image_url,
    foil: i.foil,
    quantity: i.quantity,
    price_eur: i.foil ? null : i.price,
    price_eur_foil: i.foil ? i.price : null,
    scryfall_id: i.scryfall_id ?? null,
  }));
  const itemRow = (i: TradeItem, idx: number) => (
    <li key={idx} className={`flex items-center gap-1 ${isPicked(i) ? "" : "opacity-45"}`}>
      {canPick && (
        <button
          onClick={() => togglePick(i)}
          role="checkbox"
          aria-checked={isPicked(i)}
          aria-label={`${i.name} ${isPicked(i) ? "nicht annehmen" : "annehmen"}`}
          className={`shrink-0 grid place-items-center w-6 h-6 rounded-md border text-sm ${isPicked(i) ? "bg-emerald-500 border-emerald-400 text-white" : "border-white/25"}`}
        >
          {isPicked(i) ? "✓" : ""}
        </button>
      )}
      <button
        onClick={() => setViewing(idx)}
        aria-label={`${i.name} ansehen`}
        className="min-w-0 flex-1 flex items-center gap-2.5 rounded-lg px-1 py-1 text-left hover:bg-white/5 active:bg-white/10"
      >
        <span className="relative shrink-0 w-8 h-11 rounded-[3px] overflow-hidden bg-zinc-800">
          {i.image_url && <Image src={i.image_url} alt="" width={32} height={44} className="w-full h-full object-cover" />}
          {i.foil && <span className="absolute inset-0 bg-gradient-to-tr from-fuchsia-500/30 via-transparent to-cyan-300/30" aria-hidden />}
        </span>
        <span className="min-w-0 flex-1 truncate">
          {i.quantity}× {i.name}
          {i.foil ? <span className="text-fuchsia-300"> Foil</span> : ""}
          {idx >= myItems.length && own && ownedFor(own, i).any > 0 && (
            <span className="ml-1.5 rounded bg-emerald-600/90 px-1 text-[10px] font-semibold text-white align-[1px]" title="Hast du schon">
              ✓ {ownedFor(own, i).any}
            </span>
          )}
        </span>
        <span className={`shrink-0 tabular-nums ${isPicked(i) ? "text-zinc-500" : "text-zinc-600 line-through"}`}>{formatEur(i.price)}</span>
        {!canRemove && <span className="shrink-0 text-zinc-600" aria-hidden>›</span>}
      </button>
      {canRemove && (
        <button
          onClick={() => void removeItem(i)}
          disabled={busyItem !== null}
          aria-label={`${i.name} aus dem Trade entfernen`}
          className="shrink-0 grid place-items-center w-8 h-8 rounded-full text-zinc-500 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-40"
        >
          {busyItem === i.id ? "…" : "✕"}
        </button>
      )}
    </li>
  );

  const sum = (items: TradeItem[]) =>
    items.filter(isPicked).reduce((s, i) => s + (i.price ?? 0) * i.quantity, 0);

  const otherEmail = trade.i_am_proposer
    ? trade.partner_email
    : trade.proposer_email;

  // Annehmen darf nur der Partner eines offenen Trades
  const canAccept =
    trade.status === "pending" && trade.partner_id === currentUserId;
  const canCancel =
    trade.status === "pending" && trade.proposer_id === currentUserId;

  return (
    <div className="surface p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm text-zinc-400">
            mit {otherEmail.split("@")[0]} · {formatDate(trade.created_at)}
          </span>
        </div>
        <span
          className={`text-xs rounded-full px-2 py-0.5 border ${STATUS_STYLE[trade.status]}`}
        >
          {STATUS_LABEL[trade.status]}
        </span>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-emerald-400 mb-1">
            Du gibst · {formatEur(sum(myItems))}
          </p>
          <ul className="space-y-0.5 text-zinc-300">
            {myItems.map((i, idx) => itemRow(i, idx))}
            {myItems.length === 0 && <li className="text-zinc-600">–</li>}
          </ul>
        </div>
        <div>
          <p className="text-indigo-400 mb-1">
            Du bekommst · {formatEur(sum(theirItems))}
          </p>
          <ul className="space-y-0.5 text-zinc-300">
            {theirItems.map((i, idx) => itemRow(i, myItems.length + idx))}
            {theirItems.length === 0 && <li className="text-zinc-600">–</li>}
          </ul>
        </div>
      </div>

      {trade.note && (
        <p className="text-sm text-zinc-500 italic">„{trade.note}“</p>
      )}

      {(() => {
        const diff = sum(theirItems) - sum(myItems);
        const fair = Math.abs(diff) < 1;
        return (
          <p className="text-xs">
            {fair ? (
              <span className="text-emerald-400">≈ ausgeglichener Tausch</span>
            ) : diff > 0 ? (
              <span className="text-emerald-400">
                +{formatEur(diff)} zu deinen Gunsten
              </span>
            ) : (
              <span className="text-amber-300">
                {formatEur(diff)} zu deinen Ungunsten
              </span>
            )}
          </p>
        );
      })()}

      {(canAccept || canCancel) && (
        <div className="flex gap-2 pt-1">
          {canAccept && (
            <button
              onClick={() => {
                const partial = canPick && pickedCount < trade.items.length;
                if (partial && !confirm(`Nur ${pickedCount} von ${trade.items.length} Karten annehmen? Die übrigen fallen aus dem Trade.`)) return;
                onRespond(trade.id, "accept", partial ? { itemIds: trade.items.filter(isPicked).map((i) => i.id!) } : {});
              }}
              disabled={canPick && pickedCount === 0}
              className="bg-emerald-600 hover:bg-emerald-500 transition rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-40"
            >
              {canPick && pickedCount < trade.items.length ? `Annehmen (${pickedCount} von ${trade.items.length})` : "Annehmen"}
            </button>
          )}
          <button
            onClick={() => onRespond(trade.id, "decline")}
            className="text-red-400 hover:underline text-sm"
          >
            {canCancel ? "Zurückziehen" : "Ablehnen"}
          </button>
        </div>
      )}
      {viewing !== null && viewerCards[viewing] && (
        <CardViewer
          cards={viewerCards}
          index={viewing}
          onIndexChange={setViewing}
          onClose={() => setViewing(null)}
          info={(card) => {
            const idx = viewerCards.indexOf(card);
            const mine = idx >= 0 && idx < myItems.length;
            const have = !mine && own ? ownedFor(own, card) : null;
            const decks = !mine && myDecks ? myDeckUses([{ id: card.key, name: card.name }], myDecks.cards, myDecks.decks)[card.key] : undefined;
            return (
              <>
                <p className={`rounded-xl px-3 py-2 text-sm border ${mine ? "bg-emerald-500/10 border-emerald-400/25 text-emerald-200" : "bg-indigo-500/10 border-indigo-400/25 text-indigo-200"}`}>
                  {mine ? "Du gibst" : `Du bekommst von ${otherEmail.split("@")[0]}`}: {card.quantity}×{card.foil ? " Foil" : ""}
                </p>
                {have && (
                  <p className={`rounded-xl px-3 py-2 text-sm border ${have.any ? "bg-emerald-500/10 border-emerald-400/25 text-emerald-200" : "bg-white/[0.04] border-white/10 text-zinc-400"}`}>
                    {have.any ? "✓ " : ""}{ownedText(have)}
                  </p>
                )}
                {decks?.length ? (
                  <div className="rounded-xl bg-indigo-500/10 border border-indigo-400/20 px-3 py-2.5 space-y-1.5">
                    <p className="text-sm text-indigo-200">In deinen Decks</p>
                    <div className="flex flex-wrap gap-1.5">
                      {decks.map((u) => (
                        <a key={u.deckId} href={`/decks/${u.deckId}`} className="rounded-full bg-white/[0.08] border border-white/10 px-2.5 py-1 text-xs hover:border-white/25">
                          {u.deckName}
                          {u.count > 1 && <span className="text-zinc-400"> ×{u.count}</span>}
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            );
          }}
        />
      )}
    </div>
  );
}

/**
 * Angefangene Trades: Karten, die in „Geteilt“ für einen Trade angefragt,
 * aber noch nicht abgeschickt wurden (im Browser gemerkt).
 */
function TradeDraftList() {
  const [drafts, setDrafts] = useState<TradeDrafts>({});
  useEffect(() => setDrafts(loadDrafts()), []);
  const entries = Object.entries(drafts).sort((a, b) => b[1].updated.localeCompare(a[1].updated));
  if (!entries.length) return null;

  const discard = (id: string) => {
    if (!confirm(`Angefangenen Trade mit ${drafts[id].name} verwerfen?`)) return;
    const next = withDraft(drafts, id, drafts[id].name, [], new Date().toISOString());
    saveDrafts(next);
    setDrafts(next);
  };

  return (
    <section className="space-y-2" aria-labelledby="drafts-title">
      <h2 id="drafts-title" className="font-medium text-zinc-300">Noch nicht abgeschickt</h2>
      {entries.map(([id, d]) => {
        const n = basketCount(d.basket);
        return (
          <div key={id} className="surface p-3 flex items-center gap-3 ring-1 ring-inset ring-amber-400/30">
            <span className="text-xl" aria-hidden>🔁</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">Trade mit {d.name}</p>
              <p className="text-xs text-zinc-400 truncate">
                {n} {n === 1 ? "Karte" : "Karten"} · {formatEur(basketValue(d.basket))} · {d.basket.map((b) => b.card.name).join(", ")}
              </p>
            </div>
            <button onClick={() => discard(id)} aria-label={`Trade mit ${d.name} verwerfen`} className="shrink-0 w-9 h-9 rounded-full bg-white/5 text-zinc-400 hover:text-white">
              ✕
            </button>
            <Link href={`/shared?trade=${encodeURIComponent(id)}`} className="btn-primary shrink-0 h-9 px-3 text-sm">
              Weiter ›
            </Link>
          </div>
        );
      })}
    </section>
  );
}
