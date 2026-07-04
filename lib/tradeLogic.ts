// Reine Nachbildung der Transfer-Regeln von accept_trade() (siehe
// supabase/migrations/002_trades_history.sql). Zweck: die kritische Logik
// – Bestandsprüfung und Mengenverschiebung zwischen zwei Sammlungen – ohne
// laufende Datenbank testbar zu machen. Die SQL-Funktion bleibt die Quelle
// der Wahrheit; dieser Nachbau hält dieselben Invarianten fest.

export type OwnedCard = {
  userId: string;
  scryfallId: string;
  foil: boolean;
  quantity: number;
};

export type TradeItem = {
  fromUserId: string;
  scryfallId: string;
  foil: boolean;
  quantity: number;
  name: string;
};

export type Trade = {
  proposerId: string;
  partnerId: string;
  status: "pending" | "accepted" | "declined" | "cancelled";
  items: TradeItem[];
};

function key(userId: string, scryfallId: string, foil: boolean) {
  return `${userId}|${scryfallId}|${foil}`;
}

export class TradeError extends Error {}

// Wendet einen Trade an. Wirft bei fehlender Berechtigung, nicht offenem
// Status oder unzureichendem Bestand. Gibt den neuen Kartenbestand zurück.
export function applyTrade(
  cards: OwnedCard[],
  trade: Trade,
  actingUserId: string
): OwnedCard[] {
  if (trade.partnerId !== actingUserId) {
    throw new TradeError("Nur der Handelspartner kann den Trade annehmen");
  }
  if (trade.status !== "pending") {
    throw new TradeError("Dieser Trade ist nicht mehr offen");
  }

  // Arbeitskopie als Map
  const map = new Map<string, OwnedCard>();
  for (const c of cards) map.set(key(c.userId, c.scryfallId, c.foil), { ...c });

  // 1) Bestand beider Seiten vorab prüfen (keine Karten aus dem Nichts)
  for (const it of trade.items) {
    const owned = map.get(key(it.fromUserId, it.scryfallId, it.foil))?.quantity ?? 0;
    if (owned < it.quantity) {
      throw new TradeError(`Nicht genügend Exemplare von "${it.name}" im Bestand`);
    }
  }

  // 2) Transfer durchführen
  for (const it of trade.items) {
    const receiver =
      it.fromUserId === trade.proposerId ? trade.partnerId : trade.proposerId;

    const giverKey = key(it.fromUserId, it.scryfallId, it.foil);
    const giver = map.get(giverKey)!;
    giver.quantity -= it.quantity;
    if (giver.quantity <= 0) map.delete(giverKey);

    const recvKey = key(receiver, it.scryfallId, it.foil);
    const recv = map.get(recvKey);
    if (recv) recv.quantity += it.quantity;
    else
      map.set(recvKey, {
        userId: receiver,
        scryfallId: it.scryfallId,
        foil: it.foil,
        quantity: it.quantity,
      });
  }

  return [...map.values()];
}

// Balance eines Trades aus Sicht eines Nutzers (positiv = Vorteil).
export function tradeBalance(
  items: Array<{ fromUserId: string; quantity: number; price: number | null }>,
  userId: string
): number {
  let get = 0;
  let give = 0;
  for (const it of items) {
    const value = (it.price ?? 0) * it.quantity;
    if (it.fromUserId === userId) give += value;
    else get += value;
  }
  return Math.round((get - give) * 100) / 100;
}
