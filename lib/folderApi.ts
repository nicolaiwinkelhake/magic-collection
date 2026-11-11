// Kleine Browser-Helfer für Ordner (anlegen, verschieben) – gemeinsam von
// Sammlung, Import und Scanner genutzt.
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

export async function moveCards(ids: string[], folderId: string | null): Promise<{ moved?: number; error?: string }> {
  const res = await fetch("/api/cards/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, folderId }),
  }).catch(() => null);
  const data = await res?.json().catch(() => null);
  if (!res?.ok) return { error: data?.error ?? "Verschieben fehlgeschlagen" };
  return { moved: data?.moved ?? 0 };
}
