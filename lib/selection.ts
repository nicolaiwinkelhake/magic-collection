// Mehrfachauswahl (rein, getestet): Auswahl umschalten, alle/keine, und
// beim Aktualisieren der Liste nicht mehr vorhandene Einträge verwerfen.

export function toggle(sel: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(sel);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Alle sichtbaren auswählen – sind schon alle gewählt, alle abwählen. */
export function toggleAll(sel: ReadonlySet<string>, visible: string[]): Set<string> {
  const allSelected = visible.length > 0 && visible.every((id) => sel.has(id));
  return allSelected ? new Set() : new Set(visible);
}

/** Nur Einträge behalten, die es noch gibt (z. B. nach Filter oder Löschen). */
export function prune(sel: ReadonlySet<string>, existing: string[]): Set<string> {
  const ok = new Set(existing);
  const next = new Set([...sel].filter((id) => ok.has(id)));
  return next.size === sel.size ? (sel as Set<string>) : next;
}
