// Texte der Push-Mitteilungen und wer welche Art bekommt (rein, ohne Server).

export type PushKind = "trades" | "friends" | "shares" | "loans";

export const PUSH_KINDS: { kind: PushKind; label: string; hint: string }[] = [
  { kind: "trades", label: "Trades", hint: "Neue Anfrage, angenommen oder abgelehnt" },
  { kind: "friends", label: "Freunde", hint: "Freundschaftsanfrage und Bestätigung" },
  { kind: "shares", label: "Geteilte Sammlungen", hint: "Ein Freund teilt seine Sammlung mit dir" },
  { kind: "loans", label: "Leihen", hint: "Dir wurde eine Karte geliehen" },
];

export type PushMessage = {
  kind: PushKind;
  title: string;
  body: string;
  /** Seite, die beim Antippen geöffnet wird */
  url: string;
  /** gleiche Tags ersetzen sich statt sich zu stapeln */
  tag?: string;
};

export type NotificationPrefs = Record<PushKind, boolean>;

export const DEFAULT_PREFS: NotificationPrefs = { trades: true, friends: true, shares: true, loans: true };

/** Anzeigename aus der E-Mail (wie überall in der App). */
export const nameOf = (email: string | null | undefined) => (email ? email.split("@")[0] : "Jemand");

const cards = (n: number) => (n === 1 ? "1 Karte" : `${n} Karten`);

export const messages = {
  tradeRequest: (from: string, give: number, receive: number): PushMessage => ({
    kind: "trades",
    title: `Trade-Anfrage von ${from}`,
    body:
      give && receive
        ? `${from} bietet ${cards(give)} und möchte ${cards(receive)} von dir.`
        : receive
          ? `${from} möchte ${cards(receive)} von dir.`
          : `${from} bietet dir ${cards(give)} an.`,
    url: "/trades",
    tag: "trade-request",
  }),
  tradeAccepted: (by: string): PushMessage => ({
    kind: "trades",
    title: "Trade angenommen 🎉",
    body: `${by} hat deinen Trade angenommen.`,
    url: "/trades",
  }),
  tradeDeclined: (by: string): PushMessage => ({
    kind: "trades",
    title: "Trade abgelehnt",
    body: `${by} hat deinen Trade abgelehnt.`,
    url: "/trades",
  }),
  friendRequest: (from: string): PushMessage => ({
    kind: "friends",
    title: "Neue Freundschaftsanfrage",
    body: `${from} möchte mit dir befreundet sein.`,
    url: "/friends",
    tag: "friend-request",
  }),
  friendAccepted: (by: string): PushMessage => ({
    kind: "friends",
    title: "Freundschaft bestätigt",
    body: `${by} hat deine Anfrage angenommen.`,
    url: "/friends",
  }),
  shared: (owner: string): PushMessage => ({
    kind: "shares",
    title: "Sammlung geteilt",
    body: `${owner} hat seine Sammlung mit dir geteilt.`,
    url: "/shared",
  }),
  test: (): PushMessage => ({
    kind: "trades",
    title: "Mitteilungen sind an ✅",
    body: "So sieht eine Mitteilung von Magic Collection aus.",
    url: "/account",
    tag: "test",
  }),
  loan: (lender: string, card: string): PushMessage => ({
    kind: "loans",
    title: "Karte geliehen",
    body: `${lender} hat dir ${card} geliehen.`,
    url: "/loans",
  }),
};

/** Nutzer, die diese Art bekommen wollen (ohne Eintrag gilt: alles an). */
export function wantsKind(prefs: Partial<NotificationPrefs> | null | undefined, kind: PushKind): boolean {
  return prefs?.[kind] ?? true;
}
