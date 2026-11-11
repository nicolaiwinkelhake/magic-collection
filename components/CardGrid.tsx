"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { formatEur, formatDate } from "@/lib/format";
import { cardValue } from "@/lib/valuation";
import { EmptyState } from "@/components/ui/States";
import { CardViewToggle, QuantityBadge, useCardView } from "@/components/ui/CardView";
import { ManaCost, RarityDot } from "@/components/ui/Mana";
import type { Card, Folder } from "@/lib/types";
import { FolderPicker } from "@/components/ui/FolderPicker";
import { moveCards, promptCreateFolder } from "@/lib/folderApi";
import { groupCards, type GroupKey } from "@/lib/collectionGroups";
import { SwipeSheet } from "@/components/ui/SwipeSheet";
import { SelectionBar } from "@/components/ui/SelectionBar";
import { prune, toggleAll } from "@/lib/selection";
import { PrintPicker } from "@/components/ui/PrintPicker";

export function CardGrid({
  cards,
  groupBy = "none",
  folders = [],
  onFoldersChanged,
}: {
  cards: Card[];
  groupBy?: GroupKey;
  /** eigene Ordner (Migration 014) – zum Verschieben */
  folders?: Folder[];
  /** nach Anlegen eines Ordners beim Verschieben */
  onFoldersChanged?: () => void;
}) {
  const router = useRouter();

  // Optimistische lokale Kopie: Änderungen sofort anzeigen, Server folgt.
  const [local, setLocal] = useState<Card[]>(cards);
  useEffect(() => setLocal(cards), [cards]);

  const [view, setView] = useCardView(true);
  const [editing, setEditing] = useState<Card | null>(null);
  const [preview, setPreview] = useState<Card | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [printFor, setPrintFor] = useState<Card | null>(null);
  // Verschieben: ausgewählte Karten bzw. eine Karte aus der Detailansicht
  const [moveIds, setMoveIds] = useState<string[] | null>(null);
  const [moveBusy, setMoveBusy] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [printBusy, setPrintBusy] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  // Mehrfachauswahl (Bulk-Aktionen)
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function revert(message: string) {
    setLocal(cards);
    setErrorMsg(message);
    router.refresh();
  }

  async function patch(card: Card, changes: Partial<Card>) {
    const next = { ...card, ...changes };
    const removing = (changes.quantity ?? next.quantity) <= 0;

    // 1) Sofort lokal anwenden (optimistisch)
    setLocal((prev) =>
      removing
        ? prev.filter((c) => c.id !== card.id)
        : prev.map((c) => (c.id === card.id ? next : c))
    );
    setEditing(removing ? null : next);
    setErrorMsg(null);

    // 2) Server nachziehen; bei Fehler zurückrollen
    const res = await fetch("/api/cards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: card.id, ...changes }),
    }).catch(() => null);
    if (!res?.ok) {
      revert("Änderung konnte nicht gespeichert werden – Stand zurückgesetzt.");
      return;
    }
    applyServerCard(card.id, await res.json().catch(() => null));
    router.refresh();
  }

  // Antwort des Servers übernehmen. Wurde in eine vorhandene Zeile
  // zusammengelegt (gleicher Druck + Foil gab es schon), verschwindet die
  // alte Zeile und die Detailansicht zeigt die zusammengelegte.
  function applyServerCard(oldId: string, data: { card?: Card; mergedInto?: string } | null) {
    const card = data?.card;
    if (!card) return;
    setLocal((prev) => {
      const without = data?.mergedInto ? prev.filter((c) => c.id !== oldId) : prev;
      return without.some((c) => c.id === card.id)
        ? without.map((c) => (c.id === card.id ? card : c))
        : without.map((c) => (c.id === oldId ? card : c));
    });
    setEditing((e) => (e && (e.id === oldId || e.id === card.id) ? card : e));
  }

  // In einen Ordner verschieben (Server legt gleiche Karten zusammen).
  async function moveTo(ids: string[], folderId: string | null) {
    setMoveBusy(true);
    setMoveError(null);
    const r = await moveCards(ids, folderId);
    setMoveBusy(false);
    if (r.error) {
      setMoveError(r.error);
      return;
    }
    // Lokal sofort umhängen; Zusammenlegungen kommen mit dem Neuladen
    setLocal((prev) => prev.map((c) => (ids.includes(c.id) ? { ...c, folder_id: folderId } : c)));
    setEditing((e) => (e && ids.includes(e.id) ? { ...e, folder_id: folderId } : e));
    setMoveIds(null);
    setSelected(new Set());
    setSelectMode(false);
    router.refresh();
  }

  async function createAndMove(ids: string[]) {
    const r = await promptCreateFolder();
    if (!r) return;
    if (r.error || !r.folder) {
      setMoveError(r.error ?? "Ordner konnte nicht angelegt werden");
      return;
    }
    onFoldersChanged?.();
    await moveTo(ids, r.folder.id);
  }

  // Druck wechseln (nicht optimistisch: Server prüft und legt ggf. zusammen).
  async function changePrint(card: Card, scryfallId: string) {
    setPrintBusy(true);
    setPrintError(null);
    let res: Response | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      res = await fetch("/api/cards", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: card.id, scryfallId }),
      }).catch(() => null);
      // Nur bei "Scryfall kurz weg" erneut – sonst ist die Antwort endgültig.
      if (res && res.status !== 503) break;
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
    const data = await res?.json().catch(() => null);
    setPrintBusy(false);
    if (!res?.ok) {
      setPrintError(data?.error ?? "Druck konnte nicht geändert werden – bitte erneut versuchen.");
      return;
    }
    applyServerCard(card.id, data);
    setPrintFor(null);
    router.refresh();
  }

  async function removeCards(ids: string[]) {
    setBusy(true);
    setErrorMsg(null);
    setLocal((prev) => prev.filter((c) => !ids.includes(c.id)));
    setEditing(null);
    setSelected(new Set());
    setSelectMode(false);

    const res = await fetch("/api/cards", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    setBusy(false);
    if (!res.ok) {
      revert("Löschen fehlgeschlagen – Stand zurückgesetzt.");
      return;
    }
    router.refresh();
  }

  function openCard(card: Card) {
    setEditing(card);
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const renderCards = (items: Card[]) =>
    view === "list" ? (
        <ul className="rounded-xl border border-white/10 bg-zinc-900/60 divide-y divide-white/5 overflow-hidden">
          {items.map((card) => {
            const isSelected = selected.has(card.id);
            const unit = cardValue({ ...card, quantity: 1 });
            return (
              <li key={card.id}>
                <button
                  onClick={() => (selectMode ? toggleSelected(card.id) : openCard(card))}
                  aria-label={
                    selectMode
                      ? `${card.name} ${isSelected ? "abwählen" : "auswählen"}`
                      : `${card.name} bearbeiten`
                  }
                  aria-pressed={selectMode ? isSelected : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left transition focus:outline-none focus-visible:bg-white/10 ${
                    isSelected ? "bg-indigo-500/15" : "hover:bg-white/5"
                  }`}
                >
                  {selectMode && (
                    <span
                      aria-hidden="true"
                      className={`w-5 h-5 shrink-0 rounded-full border-2 grid place-items-center text-[10px] font-bold ${
                        isSelected ? "bg-indigo-500 border-indigo-300 text-white" : "border-zinc-600 text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                  )}
                  <span className="relative shrink-0 w-10 h-14 rounded-[4px] overflow-hidden bg-zinc-800">
                    {card.image_url && (
                      <Image src={card.image_url} alt="" width={40} height={56} className="w-full h-full object-cover" />
                    )}
                    {card.foil && (
                      <span className="absolute inset-0 bg-gradient-to-tr from-fuchsia-500/30 via-transparent to-cyan-300/30" aria-hidden />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium text-sm">{card.name}</span>
                      <ManaCost cost={card.mana_cost} size="xs" />
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-zinc-500 mt-0.5">
                      <RarityDot rarity={card.rarity} />
                      <span className="uppercase">{card.set_code}</span>
                      {card.collector_number && <span>#{card.collector_number}</span>}
                      {card.foil && <span className="text-fuchsia-300">Foil</span>}
                      {card.condition && card.condition !== "NM" && <span className="text-amber-400">{card.condition}</span>}
                      {card.language && card.language !== "EN" && <span>{card.language}</span>}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-medium tabular-nums text-emerald-400">{formatEur(unit)}</span>
                    {card.quantity > 1 && <span className="block text-xs text-zinc-500 tabular-nums">×{card.quantity}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2 sm:gap-3">
        {items.map((card) => {
          const isSelected = selected.has(card.id);
          return (
            <button
              key={card.id}
              onClick={() =>
                selectMode ? toggleSelected(card.id) : openCard(card)
              }
              aria-label={
                selectMode
                  ? `${card.name} ${isSelected ? "abwählen" : "auswählen"}`
                  : `${card.name} bearbeiten`
              }
              aria-pressed={selectMode ? isSelected : undefined}
              className={`group relative text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded-[10px] ${
                isSelected ? "ring-2 ring-indigo-400" : ""
              }`}
            >
              <span className="relative block rounded-[4.75%/3.5%] overflow-hidden bg-zinc-900 shadow-md shadow-black/40 transition group-hover:-translate-y-0.5 group-hover:shadow-lg group-hover:shadow-black/60">
                {card.image_url ? (
                  <Image
                    src={card.image_url}
                    alt={card.name}
                    width={244}
                    height={340}
                    className="w-full h-auto"
                  />
                ) : (
                  <span className="aspect-[244/340] flex items-center justify-center text-zinc-600 text-sm p-2 text-center">
                    {card.name}
                  </span>
                )}
                {card.foil && (
                  <span className="absolute inset-0 bg-gradient-to-tr from-fuchsia-500/20 via-transparent to-cyan-300/25 mix-blend-screen" aria-hidden />
                )}
                <QuantityBadge count={card.quantity} />
              </span>
              {selectMode && (
                <span
                  aria-hidden="true"
                  className={`absolute top-1.5 left-1.5 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold ${
                    isSelected
                      ? "bg-indigo-500 border-indigo-300 text-white"
                      : "bg-black/50 border-zinc-400 text-transparent"
                  }`}
                >
                  ✓
                </span>
              )}
              {/* Infozeile unter dem Bild statt Beschriftungen auf der Karte */}
              {view === "details" && (
                <span className="flex items-center justify-between gap-1 px-0.5 pt-1.5 text-[11px]">
                  <span className="tabular-nums font-medium text-emerald-400">{formatEur(cardValue({ ...card, quantity: 1 }))}</span>
                  <span className="flex items-center gap-1.5 min-w-0 text-zinc-500">
                    {card.foil && <span className="text-fuchsia-300" title="Foil">Foil</span>}
                    {card.condition && card.condition !== "NM" && (
                      <span className="text-amber-400" title="Zustand">{card.condition}</span>
                    )}
                    <span className="uppercase">{card.set_code}</span>
                  </span>
                </span>
              )}
            </button>
          );
        })}
      </div>
      );

  const groups = groupCards(local, groupBy);

  // Durch die Sammlung blättern: Reihenfolge wie angezeigt (inkl. Gruppen).
  const ordered = groups.flatMap((g) => g.cards);
  const editIndex = editing ? ordered.findIndex((c) => c.id === editing.id) : -1;

  // Auswahl auf sichtbare Karten beschränken (Filter geändert, gelöscht …)
  const visibleKey = ordered.map((c) => c.id).join(",");
  useEffect(() => {
    setSelected((sel) => prune(sel, visibleKey ? visibleKey.split(",") : []));
  }, [visibleKey]);

  if (!local.length) {
    return (
      <EmptyState
        icon="🔍"
        title="Keine Karten gefunden"
        hint="Importiere welche oder ändere die Filter."
      />
    );
  }

  return (
    <>
      {/* Werkzeugleiste: Ansicht + Auswahl */}
      <div className="flex items-center justify-between gap-3 mb-3 min-h-[32px]">
        <div aria-live="polite" className="min-w-0">
          {errorMsg && <p className="text-sm text-red-400">{errorMsg}</p>}
        </div>
        <div className="flex items-center gap-2">
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
          <CardViewToggle mode={view} onChange={setView} allowList />
        </div>
      </div>

      {groups.length === 1 && groupBy === "none" ? (
        renderCards(groups[0].cards)
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.key} aria-label={g.label}>
              <h3 className="flex items-baseline justify-between gap-3 mb-2 px-0.5">
                <span className="text-sm font-semibold text-zinc-200">
                  {g.label} <span className="ml-1 text-xs font-normal text-zinc-500 tabular-nums">{g.count}</span>
                </span>
                <span className="text-xs tabular-nums text-emerald-400">{formatEur(g.value)}</span>
              </h3>
              {renderCards(g.cards)}
            </section>
          ))}
        </div>
      )}

      {/* Platz, damit die letzten Karten nicht unter der Auswahlleiste liegen */}
      {selectMode && <div className="h-24" aria-hidden />}
      {selectMode && (
        <SelectionBar
          count={selected.size}
          total={ordered.length}
          onToggleAll={() => setSelected((sel) => toggleAll(sel, ordered.map((c) => c.id)))}
          onCancel={() => {
            setSelectMode(false);
            setSelected(new Set());
          }}
          onConfirm={() => void removeCards([...selected])}
          actionLabel="Entfernen"
          confirmText="{n} Einträge wirklich aus der Sammlung entfernen?"
          busy={busy}
          secondary={{
            label: "Verschieben",
            onClick: () => {
              setMoveError(null);
              setMoveIds([...selected]);
            },
          }}
        />
      )}

      {/* Kartendetail: großes Bild, Preise, Kartentext, Bestand bearbeiten */}
      {editing && editIndex >= 0 && (
        <SwipeSheet
          index={editIndex}
          count={ordered.length}
          onIndexChange={(i) => setEditing(ordered[i])}
          onClose={() => setEditing(null)}
          title={editing.name}
          subtitle={editing.name_de || undefined}
          label={`${editing.name} – Details`}
          closeDisabled={busy}
          keyboardDisabled={!!preview || !!printFor || !!moveIds}
        >
            <div className="px-4 pt-3 pb-4 sm:p-4 grid gap-4 sm:gap-5 sm:grid-cols-[minmax(0,260px)_1fr]">
              {/* Bild */}
              <div className="mx-auto w-[78%] max-w-[300px] sm:w-full sm:max-w-none">
                {editing.image_url ? (
                  <button
                    onClick={() => setPreview(editing)}
                    aria-label={`${editing.name} groß anzeigen`}
                    className="relative block w-full rounded-[4.75%/3.5%] overflow-hidden shadow-xl shadow-black/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                  >
                    <Image src={editing.image_url} alt={editing.name} width={488} height={680} className="w-full h-auto" />
                    {editing.foil && (
                      <span className="absolute inset-0 bg-gradient-to-tr from-fuchsia-500/20 via-transparent to-cyan-300/25 mix-blend-screen" aria-hidden />
                    )}
                  </button>
                ) : (
                  <div className="aspect-[244/340] rounded-xl bg-zinc-800 grid place-items-center text-zinc-500 text-sm p-3 text-center">
                    {editing.name}
                  </div>
                )}
              </div>

              <div className="space-y-4 min-w-0">
                {/* Kartendaten */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-zinc-300">{editing.type_line}</p>
                    <ManaCost cost={editing.mana_cost} />
                  </div>
                  <p className="flex items-center gap-1.5 text-xs text-zinc-500">
                    <RarityDot rarity={editing.rarity} />
                    <span className="uppercase">{editing.set_code}</span>
                    {editing.collector_number && <span>#{editing.collector_number}</span>}
                    {editing.rarity && <span className="capitalize">· {editing.rarity}</span>}
                  </p>
                  <button
                    onClick={() => {
                      setPrintError(null);
                      setPrintFor(editing);
                    }}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/5 border border-white/10 hover:border-white/25 px-3 py-1.5 text-xs disabled:opacity-50"
                  >
                    Druck / Edition ändern
                  </button>
                  {editing.oracle_text && (
                    <p className="text-sm text-zinc-300 whitespace-pre-line rounded-xl bg-white/5 px-3 py-2 leading-relaxed">
                      {editing.oracle_text}
                    </p>
                  )}
                </div>

                {/* Preise */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <PriceTile label="Normal" value={editing.price_eur} active={!editing.foil} />
                  <PriceTile label="Foil" value={editing.price_eur_foil} active={editing.foil} />
                  <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-2 py-2">
                    <p className="text-sm font-semibold tabular-nums text-emerald-400">{formatEur(cardValue(editing))}</p>
                    <p className="text-[11px] text-zinc-400">Dein Bestand</p>
                  </div>
                </div>
                {editing.condition !== "NM" && (
                  <p className="text-[11px] text-amber-400 -mt-2">Bestandswert zustandsbereinigt ({editing.condition}).</p>
                )}

                {/* Bestand */}
                <div className="rounded-xl bg-white/5 divide-y divide-white/5">
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <span className="text-sm text-zinc-300">Anzahl</span>
                    <div className="flex items-center gap-1 rounded-full bg-black/30 p-1">
                      <button
                        disabled={busy}
                        onClick={() => patch(editing, { quantity: editing.quantity - 1 })}
                        aria-label="Menge verringern"
                        className="grid place-items-center w-8 h-8 rounded-full bg-white/10 hover:bg-white/15 text-lg disabled:opacity-50"
                      >
                        −
                      </button>
                      <span className="w-8 text-center font-semibold tabular-nums" aria-live="polite">
                        {editing.quantity}
                      </span>
                      <button
                        disabled={busy}
                        onClick={() => patch(editing, { quantity: editing.quantity + 1 })}
                        aria-label="Menge erhöhen"
                        className="grid place-items-center w-8 h-8 rounded-full bg-indigo-500 hover:bg-indigo-400 text-lg disabled:opacity-50"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between px-3 py-2.5">
                    <span className="text-sm text-zinc-300">Foil</span>
                    <button
                      role="switch"
                      aria-checked={editing.foil}
                      disabled={busy}
                      onClick={() => patch(editing, { foil: !editing.foil })}
                      className={`relative w-11 h-6 rounded-full transition ${editing.foil ? "bg-fuchsia-500" : "bg-zinc-700"}`}
                    >
                      <span
                        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${editing.foil ? "left-[1.375rem]" : "left-0.5"}`}
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between px-3 py-2.5">
                    <label className="text-sm text-zinc-300" htmlFor="cond">
                      Zustand
                    </label>
                    <select
                      id="cond"
                      disabled={busy}
                      value={editing.condition}
                      onChange={(e) => patch(editing, { condition: e.target.value })}
                      className="rounded-lg bg-black/30 border border-white/10 px-2 py-1.5 text-sm outline-none"
                    >
                      <option value="NM">Near Mint (NM)</option>
                      <option value="LP">Lightly Played (LP)</option>
                      <option value="MP">Moderately Played (MP)</option>
                      <option value="HP">Heavily Played (HP)</option>
                      <option value="DMG">Damaged (DMG)</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between px-3 py-2.5">
                    <label className="text-sm text-zinc-300" htmlFor="lang">
                      Sprache
                    </label>
                    <select
                      id="lang"
                      disabled={busy}
                      value={editing.language}
                      onChange={(e) => patch(editing, { language: e.target.value })}
                      className="rounded-lg bg-black/30 border border-white/10 px-2 py-1.5 text-sm outline-none"
                    >
                      <option value="EN">Englisch (EN)</option>
                      <option value="DE">Deutsch (DE)</option>
                      <option value="FR">Französisch (FR)</option>
                      <option value="IT">Italienisch (IT)</option>
                      <option value="ES">Spanisch (ES)</option>
                      <option value="JA">Japanisch (JA)</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between px-3 py-2.5">
                    <span className="text-sm text-zinc-300">Ordner</span>
                    <button
                      onClick={() => {
                        setMoveError(null);
                        setMoveIds([editing.id]);
                      }}
                      disabled={busy}
                      className="max-w-[60%] truncate rounded-lg bg-black/30 border border-white/10 px-3 py-1.5 text-sm disabled:opacity-50"
                    >
                      {folders.find((f) => f.id === editing.folder_id)?.name ?? "Unsortiert"} ▾
                    </button>
                  </div>
                </div>

                {/* Links */}
                <div className="flex flex-wrap gap-2 text-sm">
                  <a
                    href={`https://www.cardmarket.com/de/Magic/Products/Search?searchString=${encodeURIComponent(editing.name)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full bg-white/5 border border-white/10 hover:border-white/20 px-3 py-1.5"
                  >
                    Cardmarket ↗
                  </a>
                  <a
                    href={
                      editing.set_code && editing.collector_number
                        ? `https://scryfall.com/card/${editing.set_code}/${encodeURIComponent(editing.collector_number)}`
                        : `https://scryfall.com/search?q=${encodeURIComponent(`!"${editing.name}"`)}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full bg-white/5 border border-white/10 hover:border-white/20 px-3 py-1.5"
                  >
                    Scryfall ↗
                  </a>
                </div>

                {editing.price_updated_at && (
                  <p className="text-[11px] text-zinc-600">Preisstand: {formatDate(editing.price_updated_at)}</p>
                )}

                <button
                  disabled={busy}
                  onClick={() => removeCards([editing.id])}
                  className="w-full rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 py-2.5 text-sm disabled:opacity-50"
                >
                  Aus Sammlung entfernen
                </button>
              </div>
            </div>
        </SwipeSheet>
      )}

      {moveIds && (
        <FolderPicker
          folders={folders}
          currentId={
            moveIds.length === 1 ? (local.find((c) => c.id === moveIds[0])?.folder_id ?? null) : undefined
          }
          title={moveIds.length === 1 ? "In Ordner verschieben" : `${moveIds.length} Einträge verschieben`}
          busy={moveBusy}
          error={moveError}
          onPick={(id) => void moveTo(moveIds, id)}
          onCreate={() => void createAndMove(moveIds)}
          onClose={() => setMoveIds(null)}
        />
      )}

      {printFor && (
        <PrintPicker
          name={printFor.name}
          currentId={printFor.scryfall_id}
          busy={printBusy}
          error={printError}
          onPick={(p) => void changePrint(printFor, p.id)}
          onClose={() => setPrintFor(null)}
        />
      )}

      {/* Großansicht (Kartenvorschau) */}
      {preview && preview.image_url && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Großansicht: ${preview.name}`}
          className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-6"
          onClick={() => setPreview(null)}
        >
          <div className="max-w-xs w-full">
            <Image
              src={preview.image_url.replace("/normal/", "/large/")}
              alt={preview.name}
              width={488}
              height={680}
              className="w-full h-auto rounded-xl shadow-2xl"
            />
            <p className="text-center text-sm text-zinc-400 mt-3">
              Tippen zum Schließen
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function PriceTile({ label, value, active }: { label: string; value: number | null; active: boolean }) {
  return (
    <div className={`rounded-xl px-2 py-2 border ${active ? "bg-white/10 border-white/20" : "bg-white/5 border-transparent"}`}>
      <p className={`text-sm font-semibold tabular-nums ${active ? "text-white" : "text-zinc-400"}`}>
        {value != null ? formatEur(value) : "–"}
      </p>
      <p className="text-[11px] text-zinc-500">{label}</p>
    </div>
  );
}
