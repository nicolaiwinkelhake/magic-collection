// Unterordner (z. B. Kleinanzeigen-Anzeigen) in Ordnerlisten erkennbar machen:
// "Verkauf · Kleinanzeigen › Elfen-Bundle", direkt unter dem Elternordner.
export const SUB_SEP = " › ";

export function labelFolders<T extends { id: string; name: string; parent_id?: string | null }>(rows: T[]): T[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const top = rows.filter((r) => !r.parent_id || !byId.has(r.parent_id));
  const out: T[] = [];
  for (const t of top) {
    out.push(t);
    for (const c of rows.filter((r) => r.parent_id === t.id)) out.push({ ...c, name: `${t.name}${SUB_SEP}${c.name}` });
  }
  return out;
}

/** Beim Umbenennen den angezeigten Elternteil wieder entfernen. */
export function stripParentLabel(name: string): string {
  const i = name.lastIndexOf(SUB_SEP);
  return i >= 0 ? name.slice(i + SUB_SEP.length) : name;
}
