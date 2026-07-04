"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatEur, formatDate } from "@/lib/format";

type TradeItem = {
  name: string;
  image_url: string | null;
  foil: boolean;
  quantity: number;
  price: number | null;
  from_user_id: string;
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
      setMessage(`Fehler: ${data.error}`);
      return;
    }

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

  async function respond(id: string, action: "accept" | "decline") {
    const res = await fetch(`/api/trades/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(`Fehler: ${data.error}`);
      return;
    }
    router.refresh();
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">🔁 Trades</h1>
        <div className="flex gap-4 text-sm text-zinc-400">
          <Link href="/collection" className="hover:text-indigo-400">
            Sammlung
          </Link>
          <Link href="/friends" className="hover:text-indigo-400">
            Freunde
          </Link>
        </div>
      </header>

      {/* Neuer Trade */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <button
          onClick={() => setFormOpen(!formOpen)}
          className="text-indigo-400 font-medium"
        >
          {formOpen ? "Formular schließen ▲" : "Neuen Trade vorschlagen ▼"}
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
                    className="w-full rounded-md bg-zinc-800 px-3 py-2 outline-none"
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
                      className="w-full rounded-md bg-zinc-800 px-3 py-2 outline-none font-mono text-sm"
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
                      className="w-full rounded-md bg-zinc-800 px-3 py-2 outline-none font-mono text-sm"
                    />
                  </div>
                </div>

                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Notiz (optional)"
                  className="w-full rounded-md bg-zinc-800 px-3 py-2 outline-none text-sm"
                />

                <button
                  type="submit"
                  disabled={loading}
                  className="bg-indigo-600 hover:bg-indigo-500 transition rounded-md px-4 py-2 font-medium disabled:opacity-50"
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
}: {
  trade: Trade;
  currentUserId: string;
  onRespond: (id: string, action: "accept" | "decline") => void;
}) {
  const myItems = trade.items.filter((i) => i.from_user_id === currentUserId);
  const theirItems = trade.items.filter((i) => i.from_user_id !== currentUserId);

  const sum = (items: TradeItem[]) =>
    items.reduce((s, i) => s + (i.price ?? 0) * i.quantity, 0);

  const otherEmail = trade.i_am_proposer
    ? trade.partner_email
    : trade.proposer_email;

  // Annehmen darf nur der Partner eines offenen Trades
  const canAccept =
    trade.status === "pending" && trade.partner_id === currentUserId;
  const canCancel =
    trade.status === "pending" && trade.proposer_id === currentUserId;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
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
            {myItems.map((i, idx) => (
              <li key={idx}>
                {i.quantity}× {i.name}
                {i.foil ? " (Foil)" : ""} —{" "}
                <span className="text-zinc-500">{formatEur(i.price)}</span>
              </li>
            ))}
            {myItems.length === 0 && <li className="text-zinc-600">–</li>}
          </ul>
        </div>
        <div>
          <p className="text-indigo-400 mb-1">
            Du bekommst · {formatEur(sum(theirItems))}
          </p>
          <ul className="space-y-0.5 text-zinc-300">
            {theirItems.map((i, idx) => (
              <li key={idx}>
                {i.quantity}× {i.name}
                {i.foil ? " (Foil)" : ""} —{" "}
                <span className="text-zinc-500">{formatEur(i.price)}</span>
              </li>
            ))}
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
              onClick={() => onRespond(trade.id, "accept")}
              className="bg-emerald-600 hover:bg-emerald-500 transition rounded-md px-3 py-1.5 text-sm font-medium"
            >
              Annehmen
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
    </div>
  );
}
