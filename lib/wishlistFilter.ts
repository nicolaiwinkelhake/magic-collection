// Wunschliste: nach Freunden filtern, die die Karte besitzen (rein, getestet).
// `ownership` = Kartenname → E-Mail-Adressen der Freunde, die sie haben.

/** null = aus, "any" = irgendein Freund, sonst die E-Mail eines bestimmten Freundes */
export type FriendFilter = null | "any" | string;

/** Anzeigename eines Freundes (Teil vor dem @) */
export const friendLabel = (email: string) => email.split("@")[0];

export function friendCounts<T extends { name: string }>(
  items: T[],
  ownership: Record<string, string[]>,
): { any: number; friends: Array<{ email: string; label: string; count: number }> } {
  const per = new Map<string, number>();
  let any = 0;
  for (const it of items) {
    const owners = ownership[it.name];
    if (!owners?.length) continue;
    any++;
    for (const e of new Set(owners)) per.set(e, (per.get(e) ?? 0) + 1);
  }
  const friends = Array.from(per, ([email, count]) => ({ email, label: friendLabel(email), count })).sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label, "de"),
  );
  return { any, friends };
}

export function filterByFriend<T extends { name: string }>(
  items: T[],
  ownership: Record<string, string[]>,
  filter: FriendFilter,
): T[] {
  if (!filter) return items;
  return items.filter((it) => {
    const owners = ownership[it.name];
    if (!owners?.length) return false;
    return filter === "any" ? true : owners.includes(filter);
  });
}
