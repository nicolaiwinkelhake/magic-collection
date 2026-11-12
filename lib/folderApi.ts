// Kleine Browser-Helfer für Ordner (anlegen, Karten zuordnen) – gemeinsam
// von Sammlung, Wunschliste, Import und Scanner genutzt.
import type { Folder } from "@/lib/types";

export async function createFolder(name: string): Promise<{ folder?: Folder; error?: string }> {
  const res = await fetch("/api/folders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  }).catch(() => null);
  const data = await res?.json().catch(() => null);
  if (!res?.ok || !data?.folder) return { error: data?.error ?? "Ordner konnte nicht angelegt werden" };
  return { folder: data.folder as Folder };
}

/** Nach einem Namen fragen und den Ordner anlegen (null bei Abbruch). */
export async function promptCreateFolder(): Promise<{ folder?: Folder; error?: string } | null> {
  const name = window.prompt("Name des neuen Ordners (z. B. Trade-Binder):")?.trim();
  if (!name) return null;
  return createFolder(name);
}

/** Karten einem Ordner zuordnen (add) oder daraus entfernen (remove). */
export async function setFolderEntries(
  folderId: string,
  action: "add" | "remove",
  ids: { cardIds?: string[]; wishlistIds?: string[] },
): Promise<{ changed?: number; error?: string }> {
  const res = await fetch("/api/folders/entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folderId, action, ...ids }),
  }).catch(() => null);
  const data = await res?.json().catch(() => null);
  if (!res?.ok) return { error: data?.error ?? (action === "add" ? "Hinzufügen fehlgeschlagen" : "Entfernen fehlgeschlagen") };
  return { changed: data?.changed ?? 0 };
}

/** Nach neuem Namen fragen und umbenennen. Liefert eine Fehlermeldung oder null. */
export async function renameFolder(f: Folder): Promise<string | null> {
  const name = window.prompt("Neuer Name:", f.name)?.trim();
  if (!name || name === f.name) return null;
  const res = await fetch("/api/folders", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: f.id, name }),
  }).catch(() => null);
  const data = await res?.json().catch(() => null);
  return res?.ok ? null : data?.error ?? "Umbenennen fehlgeschlagen";
}

/**
 * Nach Rückfrage löschen. Die Karten bleiben in Sammlung und Wunschliste,
 * nur die Zuordnung verschwindet. Liefert "cancelled", eine Fehlermeldung
 * oder null (gelöscht).
 */
export async function deleteFolder(f: Folder, entriesHere: number): Promise<string | null> {
  const msg = entriesHere
    ? `Ordner „${f.name}“ löschen? Die Karten darin bleiben in deiner Sammlung bzw. Wunschliste – nur der Ordner verschwindet.`
    : `Leeren Ordner „${f.name}“ löschen?`;
  if (!window.confirm(msg)) return "cancelled";
  const res = await fetch("/api/folders", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: f.id }),
  }).catch(() => null);
  if (res?.ok) return null;
  const data = await res?.json().catch(() => null);
  return data?.error ?? "Löschen fehlgeschlagen";
}
