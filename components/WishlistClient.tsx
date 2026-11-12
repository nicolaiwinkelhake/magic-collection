"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { formatEur } from "@/lib/format";
import { CardViewer, viewerButton } from "@/components/ui/CardViewer";
import { ImportForm } from "@/components/ImportForm";
import { SelectCheck, SelectionBar } from "@/components/ui/SelectionBar";
import { toggle, toggleAll } from "@/lib/selection";
import type { Folder } from "@/lib/types";
import { FolderBar } from "@/components/FolderBar";
import { FolderPicker } from "@/components/ui/FolderPicker";
import { ALL, UNSORTED, folderStats, inFolder, wishlistMeasure, withFolder, type FolderFilter } from "@/lib/folders";
import { deleteFolder, promptCreateFolder, renameFolder } from "@/lib/folderApi";

type WishItem = {
  id: string;
  name: string;
  image_url: string | null;
  price_eur: number | null;
  /** Ordner, in denen die Karte steht (gemeinsam mit der Sammlung) */
  folder_ids?: string[];
};

export function WishlistClient({
  items: initialItems,
  ownership,
  initialFolders = [],
}: {
  items: WishItem[];
  ownership: Record<string, string[]>;
  initialFolders?: Folder[];
}) {
  const router = useRouter();
  // lokal, damit Ordner-Zuordnungen sofort sichtbar sind
  const [allItems, setAllItems] = useState<WishItem[]>(initialItems);
  useEffect(() => setAllItems(initialItems), [initialItems]);

  // Ordner (dieselben wie in der Sammlung); Auswahl wird im Browser gemerkt
  const folders = initialFolders;
  const [folder, setFolder] = useState<FolderFilter>(ALL);
  const [folderBusy, setFolderBusy] = useState(false);
  const [folderIds, setFolderIds] = useState<string[] | null>(null);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("wishlist-folder");
      if (saved) setFolder(saved);
    } catch {
      // Speicher gesperrt
    }
  }, []);
  useEffect(() => {
    if (folder !== ALL && folder !== UNSORTED && !folders.some((f) => f.id === folder)) setFolder(ALL);
  }, [folder, folders]);
  function selectFolder(f: FolderFilter) {
    setFolder(f);
    try {
      window.localStorage.setItem("wishlist-folder", f);
    } catch {
      // ignorieren
    }
  }
  const stats = useMemo(() => folderStats(allItems, wishlistMeasure), [allItems]);
  const items = useMemo(() => inFolder(allItems, folder), [allItems, folder]);
  const activeFolder = folders.find((f) => f.id === folder);
  const folderNames = (it: WishItem) =>
    folders
      .filter((f) => it.folder_ids?.includes(f.id))
      .map((f) => f.name)
      .join(", ");

  async function handleCreateFolder() {
    setFolderBusy(true);
    const r = await promptCreateFolder();
    setFolderBusy(false);
    if (!r) return;
    if (r.error || !r.folder) {
      alert(r.error ?? "Ordner konnte nicht angelegt werden");
      return;
    }
    selectFolder(r.folder.id);
    router.refresh();
  }
  async function handleRenameFolder(f: Folder) {
    setFolderBusy(true);
    const err = await renameFolder(f);
    setFolderBusy(false);
    if (err) alert(err);
    router.refresh();
  }
  async function handleDeleteFolder(f: Folder) {
    setFolderBusy(true);
    const r = await deleteFolder(f, stats.get(f.id)?.entries ?? 0);
    setFolderBusy(false);
    if (r === "cancelled") return;
    if (r) {
      alert(r);
      return;
    }
    selectFolder(ALL);
    router.refresh();
  }
  const [viewIndex, setViewIndex] = useState<number | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState(false);

  const total = items.reduce((s, i) => s + (i.price_eur ?? 0), 0);

  async function remove(id: string) {
    await fetch("/api/wishlist", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    router.refresh();
  }

  async function removeSelected() {
    setRemoving(true);
    const res = await fetch("/api/wishlist", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selected] }),
    }).catch(() => null);
    setRemoving(false);
    if (!res?.ok) {
      alert("Entfernen fehlgeschlagen – bitte erneut versuchen.");
      return;
    }
    setSelected(new Set());
    setSelectMode(false);
    router.refresh();
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold truncate">
          ⭐ Wunschliste
          {folder !== ALL && <span className="text-zinc-400 font-normal"> · {activeFolder?.name ?? "Ohne Ordner"}</span>}
        </h1>
        <Link href="/collection" className="text-indigo-400 hover:underline text-sm">
          Zur Sammlung
        </Link>
      </header>

      {(folders.length > 0 || allItems.length > 0) && (
        <FolderBar
          folders={folders}
          stats={stats}
          active={folder}
          onSelect={selectFolder}
          onCreate={() => void handleCreateFolder()}
          onRename={(f) => void handleRenameFolder(f)}
          onDelete={(f) => void handleDeleteFolder(f)}
          busy={folderBusy}
        />
      )}

      <ImportForm
        target="wishlist"
        defaultOpen={allItems.length === 0}
        folders={folders}
        defaultFolderId={folder !== ALL && folder !== UNSORTED ? folder : null}
        onFoldersChanged={() => router.refresh()}
      />

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          {items.length} {items.length === 1 ? "Karte" : "Karten"} · {folder === ALL ? "Gesamtwert" : "Wert"}{" "}
          <span className="text-emerald-400 font-medium">{formatEur(total)}</span>
        </p>
        {items.length > 0 && (
          <button
            onClick={() => {
              setSelectMode((v) => !v);
              setSelected(new Set());
            }}
            className={`rounded-lg px-3 h-8 text-xs font-medium border transition ${
              selectMode ? "bg-indigo-500/20 border-indigo-400/60 text-white" : "bg-white/5 border-white/10 text-zinc-300 hover:border-white/20"
            }`}
          >
            {selectMode ? "Fertig" : "Auswählen"}
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-zinc-500 text-center py-12">
          {allItems.length === 0 ? "Deine Wunschliste ist leer." : "In diesem Ordner ist noch keine Wunschkarte."}
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {items.map((item) => {
            const owners = ownership[item.name];
            return (
              <div
                key={item.id}
                className="relative rounded-lg overflow-hidden bg-zinc-900 border border-zinc-800 group"
              >
                <button
                  onClick={() => (selectMode ? setSelected((sel) => toggle(sel, item.id)) : setViewIndex(items.indexOf(item)))}
                  aria-label={selectMode ? `${item.name} ${selected.has(item.id) ? "abwählen" : "auswählen"}` : `${item.name} ansehen`}
                  aria-pressed={selectMode ? selected.has(item.id) : undefined}
                  className={`block w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                    selectMode && selected.has(item.id) ? "ring-2 ring-inset ring-indigo-400" : ""
                  }`}
                >
                  {item.image_url ? (
                    <Image src={item.image_url} alt={item.name} width={244} height={340} className="w-full h-auto" />
                  ) : (
                    <div className="aspect-[244/340] flex items-center justify-center text-zinc-600 text-sm p-2 text-center">
                      {item.name}
                    </div>
                  )}
                </button>
                {selectMode ? (
                  <SelectCheck selected={selected.has(item.id)} className="pointer-events-none absolute top-1.5 left-1.5" />
                ) : (
                  <button
                    onClick={() => remove(item.id)}
                    title="Entfernen"
                    className="absolute top-1 right-1 bg-black/70 hover:bg-red-600 transition rounded-full w-6 h-6 text-xs"
                  >
                    ✕
                  </button>
                )}
                {item.price_eur !== null && (
                  <div className="pointer-events-none absolute bottom-0 inset-x-0 bg-black/70 text-xs px-2 py-1">
                    {formatEur(item.price_eur)}
                  </div>
                )}
                {owners?.length ? (
                  <div className="pointer-events-none absolute bottom-6 inset-x-0 bg-emerald-700/90 text-[10px] px-2 py-1 font-medium">
                    ✅ {owners.map((e) => e.split("@")[0]).join(", ")} hat sie
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      {viewIndex != null && items[viewIndex] && (
        <CardViewer
          cards={items.map((i) => ({ key: i.id, name: i.name, image_url: i.image_url, price_eur: i.price_eur }))}
          index={viewIndex}
          onIndexChange={setViewIndex}
          keyboardDisabled={!!folderIds}
          onClose={() => setViewIndex(null)}
          info={(c) => {
            const owners = ownership[c.name];
            return owners?.length ? (
              <p className="text-sm text-emerald-400">✅ {owners.map((e) => e.split("@")[0]).join(", ")} hat sie</p>
            ) : null;
          }}
          actions={(c) => {
            const it = allItems.find((i) => i.id === c.key);
            return (
              <>
                <button onClick={() => setFolderIds([c.key])} className={viewerButton.secondary}>
                  📁 {(it && folderNames(it)) || "Ordner"}
                </button>
                <button
                  onClick={() => {
                    setViewIndex(null);
                    void remove(c.key);
                  }}
                  className={viewerButton.danger}
                >
                  Von der Wunschliste entfernen
                </button>
              </>
            );
          }}
        />
      )}
      {selectMode && (
        <>
          <div className="h-24" aria-hidden />
          <SelectionBar
            count={selected.size}
            total={items.length}
            onToggleAll={() => setSelected((sel) => toggleAll(sel, items.map((i) => i.id)))}
            onCancel={() => {
              setSelectMode(false);
              setSelected(new Set());
            }}
            onConfirm={() => void removeSelected()}
            actionLabel="Entfernen"
            confirmText="{n} Karten von der Wunschliste entfernen?"
            busy={removing}
            secondary={{ label: "Ordner", onClick: () => setFolderIds([...selected]) }}
          />
        </>
      )}
      {folderIds && (
        <FolderPicker
          kind="wishlist"
          folders={folders}
          items={allItems.filter((i) => folderIds.includes(i.id))}
          onChanged={(folderId, ids, add) => {
            setAllItems((prev) => withFolder(prev, new Set(ids), folderId, add));
            router.refresh();
          }}
          onFolderCreated={() => router.refresh()}
          onClose={() => {
            if (selectMode) {
              setSelectMode(false);
              setSelected(new Set());
            }
            setFolderIds(null);
          }}
        />
      )}
    </main>
  );
}
