// Eine Freundschaft steht in der Datenbank in beiden Richtungen (du → Freund
// und Freund → du), damit beide Seiten sie sehen. Für die Anzeige zählt jede
// Person nur einmal.

export type FriendshipLike = {
  id: string;
  status: string;
  direction: string;
  other_user_id: string;
  other_user_email: string;
  created_at: string;
};

/** Angenommene Freunde, jede Person einmal (der älteste Eintrag bleibt). */
export function uniqueFriends<T extends FriendshipLike>(rows: T[]): T[] {
  const seen = new Set<string>();
  return [...rows]
    .filter((r) => r.status === "accepted")
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .filter((r) => (seen.has(r.other_user_id) ? false : (seen.add(r.other_user_id), true)));
}

/** Offene Anfragen – ohne Personen, mit denen man schon befreundet ist. */
export function openRequests<T extends FriendshipLike>(rows: T[], direction: "incoming" | "outgoing"): T[] {
  const friends = new Set(rows.filter((r) => r.status === "accepted").map((r) => r.other_user_id));
  return rows.filter((r) => r.status === "pending" && r.direction === direction && !friends.has(r.other_user_id));
}
