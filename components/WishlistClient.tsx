"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { PageHeader } from "@/components/ui/PageHeader";
import { filterByFriend, friendCounts, friendLabel, type FriendFilter } from "@/lib/wishlistFilter";
import { TradeComposer } from "@/components/TradeComposer";
import { createClient } from "@/lib/supabase/client";
import { assignToFriends, basketFromFriendCopies } from "@/lib/wishlistTrade";
import { loadDrafts, saveDrafts, withDraft, basketCount, basketValue, type Basket, type BasketCard } from "@/lib/tradeBasket";
import { haptic } from "@/lib/haptics";

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
  const foldersDirty = useRef(false);
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
  const inThisFolder = useMemo(() => inFolder(allItems, folder), [allItems, folder]);
  // Filter "Hat ein Freund": Zahlen beziehen sich auf den gewählten Ordner
  const [friendFilter, setFriendFilter] = useState<FriendFilter>(null);
  const friends = useMemo(() => friendCounts(inThisFolder, ownership), [inThisFolder, ownership]);
  // Ist der gewählte Freund im aktuellen Ordner nicht (mehr) dabei, gilt "irgendein Freund"
  const activeFriend = friendFilter && friendFilter !== "any" && !friends.friends.some((f) => f.email === friendFilter) ? "any" : friendFilter;
  const items = useMemo(() => filterByFriend(inThisFolder, ownership, activeFriend), [inThisFolder, ownership, activeFriend]);
  // Trade vorschlagen: gilt für den gewählten Freund (oder den einzigen, der etwas hat)
  const tradeFriend =
    activeFriend && activeFriend !== "any" ? activeFriend : activeFriend === "any" && friends.friends.length === 1 ? friends.friends[0].email : null;
  // Vorbereitete Trades – je Freund einer (aus einer Auswahl über mehrere Freunde entstehen mehrere)
  type PreparedTrade = { partner: { id: string; name: string }; basket: Basket };
  const [trades, setTrades] = useState<PreparedTrade[]>([]);
  const [composerFor, setComposerFor] = useState<string | null>(null);
  const [tradeBusy, setTradeBusy] = useState(false);
  const [tradeMsg, setTradeMsg] = useState<string | null>(null);
  const composerTrade = trades.find((t) => t.partner.id === composerFor) ?? null;
  const openTrades = trades.filter((t) => t.basket.length > 0);

  // Korb ändern und als angefangenen Trade merken (erscheint unter „Trades“)
  function setTradeBasket(t: PreparedTrade, basket: Basket) {
    setTrades((all) => all.map((x) => (x.partner.id === t.partner.id ? { ...x, basket } : x)));
    saveDrafts(withDraft(loadDrafts(), t.partner.id, t.partner.name, basket, new Date().toISOString()));
  }

  /**
   * Trade(s) für Wunschkarten vorbereiten. Jede Karte geht an einen Freund, der sie in
   * seiner freigegebenen Sammlung hat – möglichst wenige Trades. Mit `onlyFriend` nur an ihn.
   */
  async function startTrade(names: string[], onlyFriend?: string) {
    setTradeMsg(null);
    const wanted = Array.from(new Set(names));
    if (!wanted.length) return;
    setTradeBusy(true);
    try {
      const supabase = createClient();
      const { data } = await supabase.rpc("collections_shared_with_me");
      const sharing = new Map(((data ?? []) as Array<{ owner_id: string; owner_email: string }>).map((o) => [o.owner_email.toLowerCase(), o]));
      if (onlyFriend && !sharing.has(onlyFriend.toLowerCase())) {
        setTradeMsg(`${friendLabel(onlyFriend)} hat seine Sammlung nicht mit dir geteilt. Bitte ihn, sie unter „Freunde“ für dich freizugeben – dann kannst du ihm hier einen Trade vorschlagen.`);
        return;
      }
      // je Karte: Freunde, mit denen ein Trade möglich ist (freigegebene Sammlung)
      const candidates: Record<string, string[]> = {};
      const notSharing = new Set<string>();
      for (const n of wanted) {
        const emails = (ownership[n] ?? []).filter((e) => !onlyFriend || e === onlyFriend);
        candidates[n] = emails.filter((e) => sharing.has(e.toLowerCase()));
        for (const e of emails) if (!sharing.has(e.toLowerCase())) notSharing.add(friendLabel(e));
      }
      const { byFriend, unassigned } = assignToFriends(wanted, candidates);
      const without = [...unassigned];
      const prepared: PreparedTrade[] = [];
      for (const [email, cardNames] of byFriend) {
        const owner = sharing.get(email.toLowerCase())!;
        const rows: BasketCard[] = [];
        for (let i = 0; i < cardNames.length; i += 100) {
          const { data: part, error } = await (supabase
            .rpc("shared_collection", { p_owner: owner.owner_id })
            .select("id, name, image_url, foil, quantity, price_eur, price_eur_foil, set_code")
            .in("name", cardNames.slice(i, i + 100)) as unknown as PromiseLike<{ data: BasketCard[] | null; error: { message: string } | null }>);
          if (error) throw new Error(error.message);
          rows.push(...(part ?? []));
        }
        const { basket, missing } = basketFromFriendCopies(rows, cardNames);
        without.push(...missing);
        if (basket.length) prepared.push({ partner: { id: owner.owner_id, name: friendLabel(email) }, basket });
      }

      if (without.length) {
        const why = notSharing.size
          ? ` – ${Array.from(notSharing).join(", ")} ${notSharing.size === 1 ? "hat" : "haben"} die Sammlung nicht für dich freigegeben`
          : "";
        setTradeMsg(`${prepared.length ? "Ohne Trade" : "Kein Trade möglich"}: ${without.join(", ")}${why}.`);
      }
      if (!prepared.length) return;

      // Zu bereits angefangenen Trades mit demselben Freund hinzufügen (auch aus „Geteilt“)
      const drafts = loadDrafts();
      const merged = prepared.map((p) => {
        const before = trades.find((t) => t.partner.id === p.partner.id)?.basket ?? drafts[p.partner.id]?.basket ?? [];
        const basket = [...before, ...p.basket.filter((b) => !before.some((x) => x.card.id === b.card.id))];
        saveDrafts(withDraft(loadDrafts(), p.partner.id, p.partner.name, basket, new Date().toISOString()));
        return { ...p, basket };
      });
      setTrades((all) => [...all.filter((t) => !merged.some((m) => m.partner.id === t.partner.id)), ...merged]);
      setSelectMode(false);
      setSelected(new Set());
      // Nur ein Freund und alles dabei: Dialog gleich öffnen. Sonst zeigt die Leiste je
      // Freund einen Trade – und darüber, welche Karten nicht dabei sind.
      if (merged.length === 1 && !without.length) setComposerFor(merged[0].partner.id);
    } catch {
      setTradeMsg("Der Trade konnte nicht vorbereitet werden. Bitte versuche es erneut.");
    } finally {
      setTradeBusy(false);
    }
  }

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

  // Auswahl gilt zuerst; sonst alle Karten der Liste, die der Freund hat
  const tradeNames = tradeFriend
    ? (selectMode && selected.size ? items.filter((i) => selected.has(i.id)) : items)
        .filter((i) => ownership[i.name]?.includes(tradeFriend))
        .map((i) => i.name)
    : [];
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
      haptic("error");
      alert("Entfernen fehlgeschlagen – bitte erneut versuchen.");
      return;
    }
    haptic("tap");
    setSelected(new Set());
    setSelectMode(false);
    router.refresh();
  }

  return (
    <main className="page max-w-4xl">
      <PageHeader
        title="Wunschliste"
        subtitle={folder !== ALL ? `📁 ${activeFolder?.name ?? "Ohne Ordner"}` : "Karten, die du noch suchst"}
      />

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

      {(friends.any > 0 || friendFilter) && (
        <div className="flex flex-wrap items-center gap-2" aria-label="Filter nach Freunden">
          <button
            onClick={() => setFriendFilter((f) => (f ? null : "any"))}
            aria-pressed={!!activeFriend}
            className={`chip h-9 text-sm ${activeFriend ? "chip-active" : ""}`}
          >
            👥 Hat ein Freund ({friends.any})
          </button>
          {activeFriend && friends.friends.length > 1 &&
            friends.friends.map((f) => (
              <button
                key={f.email}
                onClick={() => setFriendFilter(activeFriend === f.email ? "any" : f.email)}
                aria-pressed={activeFriend === f.email}
                className={`chip h-9 text-sm ${activeFriend === f.email ? "chip-active" : ""}`}
              >
                {f.label} ({f.count})
              </button>
            ))}
          {tradeFriend && tradeNames.length > 0 && (
            <button onClick={() => void startTrade(tradeNames, tradeFriend)} disabled={tradeBusy} className="btn-primary h-9 px-4 text-sm ml-auto">
              {tradeBusy ? "Lade …" : `🔁 Trade mit ${friendLabel(tradeFriend)} (${tradeNames.length})`}
            </button>
          )}
        </div>
      )}
      {activeFriend === "any" && friends.friends.length > 1 && (
        <p className="text-xs text-zinc-500">Wähle einen Freund, um ihm einen Trade für diese Karten vorzuschlagen.</p>
      )}

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
          {allItems.length === 0
            ? "Deine Wunschliste ist leer."
            : activeFriend
              ? "Keiner deiner Freunde hat eine Karte aus dieser Auswahl."
              : "In diesem Ordner ist noch keine Wunschkarte."}
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {items.map((item) => {
            const owners = ownership[item.name];
            return (
              <div
                key={item.id}
                className="surface relative overflow-hidden group"
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
                {(ownership[c.name] ?? []).map((email) => (
                  <button
                    key={email}
                    onClick={() => {
                      setViewIndex(null);
                      void startTrade([c.name], email);
                    }}
                    disabled={tradeBusy}
                    className={viewerButton.primary}
                  >
                    🔁 Trade mit {friendLabel(email)}
                  </button>
                ))}
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
      {/* Vorbereitete Trades: je Freund ein eigener, einzeln abschicken */}
      {(tradeMsg || openTrades.length > 0) && !composerTrade && !selectMode && !folderIds && viewIndex == null && (
        <div className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] lg:bottom-4 z-40 mx-auto max-w-md space-y-2 animate-[sheet_280ms_cubic-bezier(.2,.8,.2,1)]">
          {tradeMsg && (
            <div className="flex items-start gap-2 rounded-2xl bg-zinc-900/95 backdrop-blur ring-1 ring-inset ring-amber-400/30 px-3 py-2 text-sm text-amber-200 shadow-lg" role="status">
              <span className="flex-1">{tradeMsg}</span>
              <button onClick={() => setTradeMsg(null)} aria-label="Hinweis schließen" className="shrink-0 text-amber-200/80 hover:text-white">
                ✕
              </button>
            </div>
          )}
          {openTrades.length > 0 && (
            <div className="rounded-2xl bg-zinc-900/95 backdrop-blur ring-1 ring-inset ring-white/15 shadow-glow p-2 space-y-1.5">
              {openTrades.length > 1 && (
                <p className="px-2 pt-1 text-xs text-zinc-300">🔁 Auf {openTrades.length} Trades verteilt – je Freund einzeln abschicken</p>
              )}
              {openTrades.map((t) => (
                <button
                  key={t.partner.id}
                  onClick={() => setComposerFor(t.partner.id)}
                  className="press w-full flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-600 px-3 py-2.5 text-left ring-1 ring-inset ring-white/20"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {openTrades.length === 1 ? `🔁 Trade mit ${t.partner.name}` : t.partner.name}
                  </span>
                  <span className="text-xs text-white/85 tabular-nums whitespace-nowrap">
                    {basketCount(t.basket)} {basketCount(t.basket) === 1 ? "Karte" : "Karten"} · {formatEur(basketValue(t.basket))}
                  </span>
                  <span className="text-sm font-semibold">›</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {composerTrade && (
        <TradeComposer
          partner={composerTrade.partner}
          receive={composerTrade.basket}
          onReceiveChange={(b) => setTradeBasket(composerTrade, b)}
          onClose={() => setComposerFor(null)}
          onSent={() => setTradeBasket(composerTrade, [])}
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
            secondary={[
              { label: "Ordner", onClick: () => setFolderIds([...selected]) },
              { label: tradeBusy ? "…" : "🔁 Trade", onClick: () => void startTrade(items.filter((i) => selected.has(i.id)).map((i) => i.name)) },
            ]}
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
            // erst beim Schließen neu laden (sonst schließt sich das Fenster)
            foldersDirty.current = true;
          }}
          onFolderCreated={() => {
            foldersDirty.current = true;
          }}
          onClose={() => {
            if (foldersDirty.current) {
              foldersDirty.current = false;
              router.refresh();
            }
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
