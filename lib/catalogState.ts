// Stand des Karten-Katalogs (rein, getestet, auch im Browser nutzbar).

/** Stand des Katalog-Aufbaus; höher = neue Spalten (Neuimport nötig, bis dahin wird er nicht genutzt). */
export const CATALOG_VERSION = 2;

export type CatalogMetaRows = {
  lookup?: { enabled?: boolean };
  cards?: { done?: boolean; finished_at?: string; version?: number };
  defaults?: { done?: boolean };
};

/**
 * Darf die App den Katalog nutzen? Ja, sobald er einmal vollständig im
 * aktuellen Aufbau war und freigeschaltet ist. Ein laufender oder
 * abgebrochener Abgleich schaltet ihn nicht ab: Die Zeilen vom letzten
 * vollständigen Lauf sind weiter gültig (höchstens ein paar Preise sind
 * einen Tag älter). `finished_at` und `version` bleiben dafür während des
 * Abgleichs im Eintrag stehen.
 */
export function catalogUsable(m: CatalogMetaRows): boolean {
  const completedOnce = !!m.cards?.done || !!m.cards?.finished_at;
  return !!m.lookup?.enabled && completedOnce && (m.cards?.version ?? 0) >= CATALOG_VERSION && !!m.defaults?.done;
}

/** Fehler beim Abgleich, bei denen ein erneuter Versuch sinnvoll ist (Datenbank kurz überlastet, Verbindung weg). */
export function isTransient(message: string): boolean {
  return /timeout|timed out|canceling statement|deadlock|connection|fetch failed|too many/i.test(message);
}
