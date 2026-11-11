"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fileToEntries, textToEntries, type ParsedSource } from "@/lib/importSource";
import Image from "next/image";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { analyzeDeck } from "@/lib/deckAnalysis";
import { categorizeDeck } from "@/lib/deckCategories";
import { PlaytestClient } from "@/components/PlaytestClient";
import { DeckCharts } from "@/components/DeckCharts";
import { RoleOverview } from "@/components/RoleOverview";
import { ManaBasePanel } from "@/components/ManaBasePanel";
import { DeckCombosPanel } from "@/components/DeckCombosPanel";
import { DeckCoachPanel } from "@/components/DeckCoachPanel";
import { deckToText } from "@/lib/deckExport";
import { CardViewToggle, QuantityBadge, useCardView } from "@/components/ui/CardView";
import type { CardRole } from "@/lib/cardRoles";
import { formatEur, formatDate } from "@/lib/format";
import type { Deck, DeckCard } from "@/lib/deckTypes";
import { ColorIdentity, ManaCost } from "@/components/ui/Mana";
import { groupByType } from "@/lib/deckTypeGroups";
import { CardViewer, viewerButton, type ViewerCard } from "@/components/ui/CardViewer";
import { SelectCheck, SelectionBar } from "@/components/ui/SelectionBar";
import { toggle, toggleAll } from "@/lib/selection";

const artCrop = (url: string) => url.replace("/normal/", "/art_crop/").replace("/large/", "/art_crop/");

const DECK_TABS = [
  { key: "analysis", label: "Analyse" },
  { key: "improve", label: "Verbessern" },
  { key: "cards", label: "Karten" },
  { key: "test", label: "Testen" },
  { key: "history", label: "Verlauf" },
] as const;
type DeckTab = (typeof DECK_TABS)[number]["key"];

type FriendOwnership = Record<string, { friendEmail: string; quantity: number }[]>;

export function DeckDetailClient({
  deck,
  initialCards,
  missing = [],
  valueHistory = [],
}: {
  deck: Deck;
  initialCards: DeckCard[];
  missing?: DeckCard[];
  valueHistory?: { captured_on: string; total_value_eur: number }[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<DeckTab>("analysis");
  // Kartendetail zum Durchwischen: Deckliste bzw. Vorschläge einer Kategorie
  const [viewKey, setViewKey] = useState<string | null>(null);
  // Mehrfachauswahl in der Kartenliste (Schlüssel = erste Karte eines Stapels)
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState(false);
  const [suggestView, setSuggestView] = useState<{ category: string; index: number } | null>(null);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [cardView, setCardView] = useCardView(true);
  const csvRef = useRef<HTMLInputElement>(null);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ total: number; attempt: number } | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [replaceMode, setReplaceMode] = useState(false);
  const [ownership, setOwnership] = useState<FriendOwnership>({});
  const [loadingOwnership, setLoadingOwnership] = useState(false);
  const [suggestGroups, setSuggestGroups] = useState<
    Array<{
      category: string;
      label: string;
      cards: {
        id: string;
        name: string;
        imageUrl: string | null;
        eur: number | null;
        ownedQuantity: number;
        usedInDecks: string[];
        friendsOwning: { friendEmail: string; quantity: number }[];
      }[];
    }>
  >([]);
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [suggestLoaded, setSuggestLoaded] = useState(false);
  const [suggestMsg, setSuggestMsg] = useState<{ text: string; type: "success" | "info" | "error" } | null>(null);

  async function loadSuggestions() {
    setLoadingSuggest(true);
    setSuggestLoaded(true);
    try {
      const res = await fetch(`/api/decks/${deck.id}/suggestions`);
      const data = await res.json();
      setSuggestGroups(data.suggestions ?? []);
    } finally {
      setLoadingSuggest(false);
    }
  }

  async function addSuggestion(name: string) {
    setSuggestMsg(null);

    // Prüfen ob Karte in Sammlung vorhanden
    const checkRes = await fetch(`/api/cards/check?name=${encodeURIComponent(name)}`);
    const checkData = checkRes.ok ? await checkRes.json() : { owned: false };

    if (checkData.owned) {
      // Karte besitzen → nur zum Deck hinzufügen
      await fetch(`/api/decks/${deck.id}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Karte ist schon in der Sammlung → nur ins Deck legen, nicht doppelt zählen.
        body: JSON.stringify({ names: [name], addToCollection: false }),
      });
      setSuggestMsg({ text: `„${name}" ist in deiner Sammlung und wurde zum Deck hinzugefügt.`, type: "success" });
    } else {
      // Karte nicht in Sammlung → auf Wunschliste
      const wishRes = await fetch("/api/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names: name }),
      });
      const wishData = wishRes.ok ? await wishRes.json() : { added: 0 };
      if (wishData.added > 0) {
        setSuggestMsg({ text: `„${name}" ist nicht in deiner Sammlung und wurde zur Wunschliste hinzugefügt.`, type: "info" });
      } else {
        setSuggestMsg({ text: `„${name}" konnte nicht zur Wunschliste hinzugefügt werden.`, type: "error" });
      }
    }

    router.refresh();
  }

  // --- Commander-Bracket ---
  const [bracket, setBracket] = useState<null | {
    bracket: number;
    label: string;
    gameChangers: string[];
    reasons: string[];
    signals: {
      gameChangerCount: number;
      massLandDenial: string[];
      fastMana: string[];
      tutors: string[];
    };
  }>(null);
  const [loadingBracket, setLoadingBracket] = useState(false);
  const [bracketLoaded, setBracketLoaded] = useState(false);

  async function loadBracket() {
    setLoadingBracket(true);
    setBracketLoaded(true);
    try {
      const res = await fetch(`/api/decks/${deck.id}/bracket`);
      const data = await res.json();
      if (res.ok) setBracket(data);
    } finally {
      setLoadingBracket(false);
    }
  }

  // --- Deck bearbeiten ---
  const [editOpen, setEditOpen] = useState(false);
  const [newName, setNewName] = useState(deck.name);
  const [newCommander, setNewCommander] = useState("");
  const [newPartner, setNewPartner] = useState("");
  const [removePartner, setRemovePartner] = useState(false);
  const [editMsg, setEditMsg] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  async function saveDeckEdit() {
    setSavingEdit(true);
    setEditMsg(null);
    const body: Record<string, string> = {};
    if (newName.trim() && newName.trim() !== deck.name) body.name = newName.trim();
    if (newCommander.trim()) body.commanderName = newCommander.trim();
    if (removePartner) body.partnerName = "";
    else if (newPartner.trim()) body.partnerName = newPartner.trim();
    const res = await fetch(`/api/decks/${deck.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setSavingEdit(false);
    if (!res.ok) {
      setEditMsg(`Fehler: ${data.error}`);
      return;
    }
    setNewCommander("");
    setNewPartner("");
    setRemovePartner(false);
    setEditOpen(false);
    router.refresh();
  }

  async function deleteDeck() {
    if (!confirm("Dieses Deck wirklich löschen?")) return;
    await fetch(`/api/decks/${deck.id}`, { method: "DELETE" });
    router.push("/decks");
    router.refresh();
  }

  async function removeDeckCard(cardId: string, cardName: string) {
    if (!confirm(`"${cardName}" wirklich aus dem Deck entfernen? Die Karte bleibt in deiner Sammlung.`)) return;
    const res = await fetch(`/api/decks/${deck.id}/cards`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(`Fehler beim Entfernen: ${data.error ?? res.status}`);
      return;
    }
    router.refresh();
  }

  // Auswahl beenden, wenn der Reiter wechselt
  useEffect(() => {
    setSelectMode(false);
    setSelected(new Set());
  }, [tab]);

  // Ausgewählte Karten (jeweils alle Kopien eines Stapels) aus dem Deck nehmen.
  async function removeSelected() {
    const ids = viewerStacks
      .filter((st) => selected.has(st[0].id) && !st[0].is_commander)
      .flatMap((st) => st.map((c) => c.id));
    if (!ids.length) return;
    setRemoving(true);
    const res = await fetch(`/api/decks/${deck.id}/cards`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardIds: ids }),
    }).catch(() => null);
    setRemoving(false);
    if (!res?.ok) {
      const data = await res?.json().catch(() => ({}));
      alert(`Fehler beim Entfernen: ${data?.error ?? res?.status ?? "Verbindung"}`);
      return;
    }
    setSelected(new Set());
    setSelectMode(false);
    router.refresh();
  }

  // Kartenrollen (Ramp, Draw, Removal …) aus Scryfall-Tags, global gecacht.
  // Fehlende werden in Runden nachgeschlagen; bis dahin schätzt die Analyse
  // per Kartentext.
  const [roles, setRoles] = useState<Map<string, CardRole[]>>(new Map());
  const [rolesPending, setRolesPending] = useState<number | null>(null);
  useEffect(() => {
    const names = Array.from(new Set(initialCards.map((c) => c.name)));
    if (!names.length) return;
    let cancelled = false;
    (async () => {
      for (let round = 0; round < 20 && !cancelled; round++) {
        const data = await fetch("/api/cards/roles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ names }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);
        if (!data || cancelled) break;
        setRoles(new Map(Object.entries(data.roles as Record<string, CardRole[]>)));
        setRolesPending(data.pending || null);
        if (!data.pending) break;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialCards]);

  // Farbidentität nachfüllen (ältere Decks speicherten nur "colors").
  useEffect(() => {
    if (!initialCards.some((c) => c.color_identity == null || c.produced_mana == null)) return;
    fetch(`/api/decks/${deck.id}/metadata`, { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && (d.updated > 0 || d.colorIdentity?.join() !== (deck.color_identity ?? []).join())) router.refresh();
      })
      .catch(() => {});
  }, [initialCards, deck.id]);

  const { stats, suggestions } = useMemo(
    () => analyzeDeck(initialCards, deck.color_identity ?? [], roles),
    [initialCards, deck.color_identity, roles]
  );

  const totalValue = useMemo(() => {
    return initialCards.reduce((sum, c) => sum + (c.price_eur ?? 0), 0);
  }, [initialCards]);

  const categories = useMemo(
    () => categorizeDeck(initialCards, roles),
    [initialCards, roles]
  );

  const formattedValue = formatEur(totalValue);

  // Identische Karten (gleiche Scryfall-ID) für die Anzeige stapeln
  const stackedCards = useMemo(() => {
    const groups = new Map<string, DeckCard[]>();
    for (const card of initialCards) {
      const key = `${card.scryfall_id}-${card.is_commander}`;
      const list = groups.get(key);
      if (list) list.push(card);
      else groups.set(key, [card]);
    }
    return Array.from(groups.values());
  }, [initialCards]);

  const typeGroups = useMemo(() => groupByType(stackedCards), [stackedCards]);

  // Reihenfolge wie in der Kartenliste angezeigt (nach Typ gruppiert).
  const viewerStacks = useMemo(() => typeGroups.flatMap((g) => g.stacks), [typeGroups]);
  const viewerCards: ViewerCard[] = useMemo(
    () =>
      viewerStacks.map((stack) => ({
        key: stack[0].id,
        name: stack[0].name,
        image_url: stack[0].image_url,
        type_line: stack[0].type_line,
        mana_cost: stack[0].mana_cost,
        oracle_text: stack[0].oracle_text,
        price_eur: stack[0].price_eur,
        price_eur_foil: stack[0].price_eur_foil,
        quantity: stack.length,
      })),
    [viewerStacks],
  );
  const viewIndex = viewKey ? viewerCards.findIndex((c) => c.key === viewKey) : -1;

  useEffect(() => {
    if (!initialCards.length) return;
    setLoadingOwnership(true);
    fetch("/api/friends/owning", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ names: initialCards.map((c) => c.name) }),
    })
      .then((res) => res.json())
      .then((data) => setOwnership(data.result ?? {}))
      .finally(() => setLoadingOwnership(false));
  }, [initialCards]);

  async function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (csvRef.current) csvRef.current.value = "";
    if (!file) return;
    let content: string;
    try {
      content = await file.text();
    } catch {
      setImportMessage("Die Datei konnte nicht gelesen werden.");
      return;
    }
    await runDeckImport(fileToEntries(content));
  }

  // Deckliste über einen Link laden und ins Textfeld übernehmen (dann wie
  // gewohnt importieren).
  const [importUrl, setImportUrl] = useState("");
  const [loadingUrl, setLoadingUrl] = useState(false);
  async function loadFromUrl() {
    setLoadingUrl(true);
    setImportMessage(null);
    const res = await fetch(`/api/deck-list-from-url?url=${encodeURIComponent(importUrl.trim())}`).catch(() => null);
    const data = await res?.json().catch(() => null);
    setLoadingUrl(false);
    if (!res?.ok || !data) {
      setImportMessage(`Fehler: ${data?.error ?? "Link konnte nicht geladen werden"}`);
      return;
    }
    setImportText(data.text);
    const cmd = (data.commanders as string[]).filter((c) => c !== deck.commander_name && c !== deck.partner_name);
    setImportMessage(
      `${data.text.split("\n").length} Zeilen geladen – prüfen und auf „Importieren“ klicken.` +
        (cmd.length ? ` Hinweis: Das verlinkte Deck hat als Commander ${cmd.join(" + ")}.` : "")
    );
  }

  async function handleImport() {
    if (!importText.trim()) return;
    const ok = await runDeckImport(textToEntries(importText));
    if (ok) setImportText("");
  }

  // Gleiche Erkennung wie Sammlung/Wunschliste (Textliste, ManaBox-/Moxfield-
  // CSV mit IDs, andere CSVs). Der Server löst erst alle Karten auf und
  // schreibt danach; meldet er 503 (Scryfall kurz weg), wurde noch nichts
  // geändert und ein neuer Versuch ist gefahrlos.
  async function runDeckImport(parsed: ParsedSource): Promise<boolean> {
    if (parsed.problem) {
      setImportMessage(parsed.problem);
      return false;
    }
    if (replaceMode && !confirm("Bestehende Deckliste wirklich durch diese Karten ersetzen? Der Commander bleibt erhalten.")) {
      return false;
    }
    const total = parsed.entries.reduce((n, e) => n + e.quantity, 0);
    setImporting(true);
    setImportMessage(null);
    try {
      for (let attempt = 1; attempt <= 3; attempt++) {
        setImportProgress({ total, attempt });
        let res: Response;
        try {
          res = await fetch(`/api/decks/${deck.id}/cards`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ entries: parsed.entries, replace: replaceMode }),
          });
        } catch {
          // Unklar, ob der Server schon geschrieben hat – nicht blind wiederholen.
          setImportMessage("Verbindung abgebrochen. Bitte prüfe die Kartenliste, bevor du es erneut versuchst.");
          router.refresh();
          return false;
        }
        const data = await res.json().catch(() => ({}));
        if (res.status === 503 && attempt < 3) {
          await new Promise((r) => setTimeout(r, 2000 * attempt));
          continue;
        }
        if (!res.ok) {
          let msg = `Fehler: ${data.error ?? `Server antwortet mit ${res.status}`}`;
          if (data.notFound?.length) msg += ` Nicht gefunden: ${data.notFound.join(", ")}`;
          setImportMessage(msg);
          return false;
        }
        let msg = `${data.inserted} Karte(n) hinzugefügt.`;
        if (data.repeated?.length) {
          msg += ` Mehrfach vorhanden: ${data.repeated.map((r: { name: string; count: number }) => `${r.name} (${r.count}x)`).join(", ")}.`;
        }
        if (data.notFound?.length) msg += ` Nicht gefunden: ${data.notFound.join(", ")}`;
        setImportMessage(msg);
        router.refresh();
        return true;
      }
      return false;
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-4 sm:py-8 space-y-4">
      {/* Kopfbereich: Commander-Artwork als Banner */}
      <header className="relative -mx-4 sm:mx-0 overflow-hidden sm:rounded-2xl border-y sm:border border-white/10 bg-zinc-900">
        {deck.commander_image_url && (
          <Image
            src={artCrop(deck.commander_image_url)}
            alt=""
            fill
            priority
            sizes="(min-width: 1152px) 1152px, 100vw"
            className="object-cover object-[center_25%]"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0f0f12] via-[#0f0f12]/70 to-black/20" aria-hidden />
        <div className="relative flex items-center justify-between p-3">
          <Link
            href="/decks"
            aria-label="Zurück zu Decks"
            className="grid place-items-center w-9 h-9 rounded-full bg-black/50 backdrop-blur hover:bg-black/70 transition"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
          <button
            onClick={() => setEditOpen((v) => !v)}
            aria-expanded={editOpen}
            className="rounded-full bg-black/50 backdrop-blur hover:bg-black/70 transition px-3 h-9 text-sm"
          >
            Bearbeiten
          </button>
        </div>
        <div className="relative flex items-end gap-4 px-4 pb-4 pt-10 sm:pt-16">
          {deck.commander_image_url && (
            <Image
              src={deck.commander_image_url}
              alt={deck.commander_name}
              width={96}
              height={134}
              className="hidden sm:block w-24 h-auto rounded-[6px] shadow-xl shadow-black/60 ring-1 ring-white/10"
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <ColorIdentity colors={deck.color_identity} />
            </div>
            <h1 className="mt-1 text-2xl sm:text-3xl font-semibold leading-tight drop-shadow">{deck.name}</h1>
            <p className="text-sm text-zinc-300 truncate">
              {deck.commander_name}
              {deck.partner_name && <> + {deck.partner_name}</>}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="font-semibold text-emerald-400 tabular-nums">{formattedValue}</span>
              <span className="text-zinc-300 tabular-nums">{stats.totalCards} Karten</span>
              <span className="text-zinc-400 tabular-nums">Ø {stats.avgCmc} MW</span>
              <Link
                href={`/commanders/${encodeURIComponent(deck.commander_name)}${
                  deck.partner_name ? `?partner=${encodeURIComponent(deck.partner_name)}` : ""
                }`}
                className="text-indigo-300 hover:text-indigo-200"
              >
                Empfehlungen →
              </Link>
            </div>
          </div>
        </div>
      </header>

      {editOpen && (
        <div className="bg-zinc-900/70 border border-white/10 rounded-2xl p-4 space-y-3">
          <div className="space-y-1">
            <label className="text-sm text-zinc-400">Deckname</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full rounded-md bg-zinc-800 px-3 py-2 outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-zinc-400">
              Commander tauschen (optional)
            </label>
            <input
              value={newCommander}
              onChange={(e) => setNewCommander(e.target.value)}
              placeholder={deck.commander_name}
              className="w-full rounded-md bg-zinc-800 px-3 py-2 outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-zinc-400">
              Partner / Background (optional)
            </label>
            <input
              value={newPartner}
              onChange={(e) => setNewPartner(e.target.value)}
              placeholder={deck.partner_name ?? "z. B. Tymna the Weaver"}
              disabled={removePartner}
              className="w-full rounded-md bg-zinc-800 px-3 py-2 outline-none disabled:opacity-50"
            />
            {deck.partner_name && (
              <label className="flex items-center gap-2 text-sm text-zinc-400">
                <input type="checkbox" checked={removePartner} onChange={(e) => setRemovePartner(e.target.checked)} />
                Partner „{deck.partner_name}“ entfernen
              </label>
            )}
          </div>
          {editMsg && <p className="text-sm text-red-400">{editMsg}</p>}
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={deleteDeck}
              className="text-red-400 hover:underline text-sm"
            >
              Deck löschen
            </button>
            <div className="flex gap-3">
              <button
                onClick={() => setEditOpen(false)}
                className="text-zinc-400 hover:underline text-sm"
              >
                Abbrechen
              </button>
              <button
                onClick={saveDeckEdit}
                disabled={savingEdit}
                className="bg-indigo-600 hover:bg-indigo-500 transition rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                {savingEdit ? "Speichere..." : "Speichern"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reiter */}
      <nav
        className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-30 -mx-4 px-4 py-2 bg-[#0f0f12]/85 backdrop-blur-xl"
        aria-label="Deck-Bereiche"
      >
        <div className="flex gap-1 overflow-x-auto no-scrollbar rounded-xl bg-white/5 border border-white/10 p-1">
          {DECK_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              aria-current={tab === t.key ? "page" : undefined}
              className={`flex-1 shrink-0 whitespace-nowrap rounded-lg px-3 h-9 text-sm font-medium transition ${
                tab === t.key ? "bg-white/15 text-white shadow" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      {tab === "analysis" && (
        <>
        {/* Analyse */}
        <div className="bg-zinc-900/70 border border-white/10 rounded-2xl p-4 space-y-4">
          <h2 className="font-medium text-lg">📊 Deck-Analyse</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-sm">
            <Stat label="Karten" value={stats.totalCards} />
            <Stat label="Länder" value={stats.lands} />
            <Stat label="Ø Manawert" value={stats.avgCmc} />
            <div className="bg-white/5 rounded-xl py-2">
              <p className="text-lg font-semibold text-emerald-400">
                {formattedValue}
              </p>
              <p className="text-zinc-500 text-xs">Deckwert</p>
            </div>
          </div>

          <RoleOverview cards={initialCards} roles={roles} pending={rolesPending} />

          <div className="space-y-2">
            {suggestions.map((s, i) => (
              <div
                key={i}
                className={`text-sm rounded-md px-3 py-2 ${
                  s.severity === "warning"
                    ? "bg-amber-900/40 text-amber-300 border border-amber-800"
                    : "bg-zinc-800 text-zinc-300"
                }`}
              >
                {s.severity === "warning" ? "⚠️ " : "ℹ️ "}
                {s.message}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-zinc-900/70 border border-white/10 rounded-2xl p-4">
          <ManaBasePanel cards={initialCards} />
        </div>
        {/* Commander-Bracket / Power-Level */}
        <div className="bg-zinc-900/70 border border-white/10 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Power-Level (Commander-Bracket)</h2>
            {!bracketLoaded && (
              <button
                onClick={loadBracket}
                className="bg-indigo-600 hover:bg-indigo-500 transition rounded-md px-3 py-1.5 text-sm font-medium"
              >
                Bracket berechnen
              </button>
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            Offizielles 5-Stufen-System (Beta). Basiert auf der Game-Changers-Liste
            von Scryfall.
          </p>

          {loadingBracket && (
            <p className="text-sm text-zinc-500 mt-3">Berechne…</p>
          )}

          {bracket && (
            <div className="mt-3 space-y-3">
              <div className="flex items-center gap-3">
                {[1, 2, 3, 4, 5].map((n) => (
                  <div
                    key={n}
                    className={`flex-1 h-2 rounded-full ${
                      n <= bracket.bracket ? "bg-indigo-500" : "bg-zinc-800"
                    }`}
                  />
                ))}
              </div>
              <p className="font-semibold text-indigo-300">{bracket.label}</p>

              <ul className="text-sm text-zinc-300 space-y-1">
                {bracket.reasons.map((r, i) => (
                  <li key={i}>• {r}</li>
                ))}
              </ul>

              {bracket.gameChangers.length > 0 && (
                <div className="text-sm">
                  <span className="text-zinc-400">Game Changer im Deck: </span>
                  <span className="text-amber-300">
                    {bracket.gameChangers.join(", ")}
                  </span>
                </div>
              )}

              <p className="text-xs text-zinc-500">
                Hinweis: Zwei-Karten-Combos werden über eine kuratierte Liste
                bekannter Kombinationen erkannt – nicht erschöpfend. Ungewöhnliche
                Combos bei Bedarf selbst prüfen.
              </p>
            </div>
          )}
        </div>

        {/* Mana-Kurve & Farbverteilung */}
        <DeckCharts cards={initialCards} />

        </>
      )}

      {tab === "improve" && (
        <>
        <div className="bg-zinc-900/70 border border-white/10 rounded-2xl p-4">
          <DeckCoachPanel
            deckId={deck.id}
            deckCards={initialCards.map((c) => ({ id: c.id, name: c.name, is_commander: c.is_commander }))}
          />
        </div>
        <div className="bg-zinc-900/70 border border-white/10 rounded-2xl p-4">
          <DeckCombosPanel deckId={deck.id} />
        </div>
        {/* Scryfall-basierte Kartenvorschläge */}
        <div className="bg-zinc-900/70 border border-white/10 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Kartenvorschläge</h2>
            {!suggestLoaded && (
              <button
                onClick={loadSuggestions}
                className="bg-indigo-600 hover:bg-indigo-500 transition rounded-md px-3 py-1.5 text-sm font-medium"
              >
                Vorschläge laden
              </button>
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            Passend zur Farbidentität des Commanders, gefiltert nach den schwächsten
            Kategorien deines Decks. Quelle: Scryfall.
          </p>

          {suggestMsg && (
            <p className={`text-sm mt-2 px-3 py-2 rounded-md ${
              suggestMsg.type === "success" ? "bg-emerald-900/40 text-emerald-300" :
              suggestMsg.type === "info" ? "bg-indigo-900/40 text-indigo-300" :
              "bg-red-900/40 text-red-300"
            }`}>
              {suggestMsg.text}
            </p>
          )}

          {loadingSuggest && (
            <p className="text-sm text-zinc-500 mt-3">Suche Vorschläge…</p>
          )}

          {suggestLoaded && !loadingSuggest && suggestGroups.length === 0 && (
            <p className="text-sm text-emerald-400 mt-3">
              Keine offensichtlichen Lücken gefunden – das Deck ist gut ausbalanciert.
            </p>
          )}

          {suggestGroups.map((group) => (
            <div key={group.category} className="mt-4">
              <p className="text-sm font-medium text-indigo-300 mb-2">
                Mehr {group.label}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                {group.cards.map((c, i) => (
                  <div
                    key={c.id}
                    className="relative rounded-lg overflow-hidden bg-zinc-950 border border-zinc-800 group"
                  >
                    <button
                      onClick={() => setSuggestView({ category: group.category, index: i })}
                      aria-label={`${c.name} ansehen`}
                      className="block w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                    >
                      {c.imageUrl ? (
                        <Image src={c.imageUrl} alt={c.name} width={244} height={340} className="w-full h-auto" />
                      ) : (
                        <div className="aspect-[244/340] flex items-center justify-center text-zinc-600 text-xs p-2 text-center">
                          {c.name}
                        </div>
                      )}
                    </button>
                    <button
                      onClick={() => addSuggestion(c.name)}
                      className="absolute inset-x-0 bottom-0 bg-indigo-600/90 hover:bg-indigo-500 transition text-xs py-1.5 font-medium opacity-0 group-hover:opacity-100"
                    >
                      + Hinzufügen
                    </button>
                    {c.eur !== null && (
                      <span className="pointer-events-none absolute top-1 left-1 bg-black/70 text-[10px] rounded px-1.5 py-0.5">
                        {formatEur(c.eur)}
                      </span>
                    )}
                    {(c.ownedQuantity > 0 || c.usedInDecks.length > 0 || c.friendsOwning.length > 0) && (
                      <div className="p-1.5 space-y-1 bg-zinc-950">
                        {c.ownedQuantity > 0 && (
                          <p className="text-[10px] leading-tight text-emerald-400">
                            In Sammlung ×{c.ownedQuantity}
                          </p>
                        )}
                        {c.usedInDecks.length > 0 && (
                          <p className="text-[10px] leading-tight text-amber-400">
                            Auch in: {c.usedInDecks.join(", ")}
                          </p>
                        )}
                        {c.friendsOwning.map((f) => (
                          <p key={f.friendEmail} className="text-[10px] leading-tight text-indigo-300">
                            Bei {f.friendEmail} ×{f.quantity}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Baubarkeit aus der Sammlung */}
        {(() => {
          const nonCommander = initialCards.filter((c) => !c.is_commander);
          const total = nonCommander.length;
          const owned = total - missing.length;
          const missingValue = missing.reduce((s, c) => s + (c.price_eur ?? 0), 0);

          function getCategory(typeLine: string): string {
            if (typeLine?.includes("Land")) return "Land";
            if (typeLine?.includes("Creature")) return "Kreatur";
            if (typeLine?.includes("Instant")) return "Instant";
            if (typeLine?.includes("Sorcery")) return "Hexerei";
            if (typeLine?.includes("Enchantment")) return "Verzauberung";
            if (typeLine?.includes("Artifact")) return "Artefakt";
            if (typeLine?.includes("Planeswalker")) return "Planeswalker";
            return "Sonstiges";
          }

          const grouped = missing.reduce<Record<string, typeof missing>>((acc, c) => {
            const cat = getCategory(c.type_line ?? "");
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(c);
            return acc;
          }, {});

          const categoryOrder = ["Land", "Kreatur", "Instant", "Hexerei", "Verzauberung", "Artefakt", "Planeswalker", "Sonstiges"];

          return (
            <div className="bg-zinc-900/70 border border-white/10 rounded-2xl p-4 space-y-3">
              <h2 className="font-medium">Baubarkeit aus deiner Sammlung</h2>
              {total === 0 ? (
                <p className="text-sm text-zinc-500">Noch keine Karten im Deck.</p>
              ) : (
                <>
                  {/* Fortschrittsbalken */}
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-zinc-400">{owned} / {total} Karten vorhanden</span>
                      {missing.length > 0 && (
                        <span className="text-zinc-400">Fehlen: <span className="text-emerald-400">{formatEur(missingValue)}</span></span>
                      )}
                    </div>
                    <div className="w-full bg-zinc-700 rounded-full h-2">
                      <div
                        className="bg-emerald-500 h-2 rounded-full transition-all"
                        style={{ width: `${total > 0 ? (owned / total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>

                  {missing.length === 0 ? (
                    <p className="text-sm text-emerald-400">✅ Du besitzt alle Karten dieses Decks.</p>
                  ) : (
                    <div className="space-y-3">
                      {categoryOrder
                        .filter((cat) => grouped[cat]?.length)
                        .map((cat) => (
                          <div key={cat}>
                            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">
                              {cat} ({grouped[cat].length})
                            </h3>
                            <ul className="text-sm text-zinc-300 space-y-0.5">
                              {grouped[cat].map((c) => (
                                <li key={c.id} className="flex justify-between">
                                  <span>{c.name}</span>
                                  <span className="text-zinc-500">{formatEur(c.price_eur)}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })()}

        </>
      )}

      {tab === "cards" && (
        <>
        <div className="flex flex-wrap gap-3 text-sm">
          <button
            onClick={() => {
              void navigator.clipboard?.writeText(deckToText(initialCards));
              setExportMsg("Deckliste kopiert – z. B. in Moxfield oder Archidekt einfügen.");
            }}
            className="bg-zinc-800 border border-zinc-700 hover:border-zinc-500 rounded-md px-3 py-1.5"
          >
            Deckliste kopieren
          </button>
          <button
            onClick={() => {
              const url = URL.createObjectURL(new Blob([deckToText(initialCards)], { type: "text/plain;charset=utf-8" }));
              const a = document.createElement("a");
              a.href = url;
              a.download = `${deck.name.replace(/[^\w\- ]+/g, "").trim() || "deck"}.txt`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="bg-zinc-800 border border-zinc-700 hover:border-zinc-500 rounded-md px-3 py-1.5"
          >
            Als .txt speichern
          </button>
          {exportMsg && <span className="self-center text-emerald-300">{exportMsg}</span>}
        </div>
        {/* Import */}
        <div className="bg-zinc-900/70 border border-white/10 rounded-2xl p-4">
          <button
            onClick={() => setImportOpen(!importOpen)}
            className="text-indigo-400 font-medium"
          >
            {importOpen ? "Import schließen ▲" : "Karten zum Deck hinzufügen ▼"}
          </button>
          {importOpen && (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap gap-2">
                <input
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  placeholder="Link zu Moxfield, Archidekt, TappedOut …"
                  aria-label="Deck-Link"
                  className="flex-1 min-w-[220px] rounded-md bg-zinc-800 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
                <button
                  onClick={loadFromUrl}
                  disabled={!importUrl.trim() || loadingUrl}
                  className="bg-zinc-800 border border-zinc-700 hover:border-zinc-500 rounded-md px-3 py-2 text-sm disabled:opacity-50"
                >
                  {loadingUrl ? "Lade…" : "Liste von Link laden"}
                </button>
              </div>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                rows={6}
                placeholder={"Sol Ring\n1x Arcane Signet\nSwords to Plowshares"}
                className="w-full rounded-md bg-zinc-800 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
              />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleImport}
                  disabled={importing || !importText.trim()}
                  className="bg-indigo-600 hover:bg-indigo-500 transition rounded-md px-4 py-2 font-medium disabled:opacity-50"
                >
                  {importing ? "Importiere..." : "Hinzufügen"}
                </button>
                <span className="text-zinc-600 text-sm">oder</span>
                <label
                  className={`bg-zinc-800 border border-zinc-700 hover:border-zinc-500 transition rounded-md px-4 py-2 text-sm ${
                    importing ? "opacity-50 pointer-events-none" : "cursor-pointer"
                  }`}
                >
                  {importing ? "Importiere..." : "CSV-Datei wählen"}
                  <input
                    ref={csvRef}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleCsvFile}
                    disabled={importing}
                    className="hidden"
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer w-fit">
                <input
                  type="checkbox"
                  checked={replaceMode}
                  onChange={(e) => setReplaceMode(e.target.checked)}
                  className="rounded"
                />
                Deckliste ersetzen (bestehende Nicht-Commander-Karten werden entfernt, Sammlungsmenge entsprechend reduziert)
              </label>
              <p className="text-xs text-zinc-500">
                Liste („2x Sol Ring“) oder CSV aus ManaBox, Moxfield, Archidekt … – CSVs mit Scryfall-ID werden exakt zugeordnet.
              </p>
              {importProgress && (
                <div className="space-y-1" aria-live="polite">
                  <div
                    className="relative h-3 w-full overflow-hidden rounded-full bg-zinc-800"
                    role="progressbar"
                    aria-label="Deck-Import läuft"
                  >
                    <div className="absolute inset-y-0 w-2/5 rounded-full bg-indigo-400 animate-[indeterminate_1.2s_ease-in-out_infinite]" />
                  </div>
                  <p className="text-xs text-zinc-400">
                    {importProgress.total} Karten werden nachgeschlagen und ins Deck gelegt …
                    {importProgress.attempt > 1 && ` (Scryfall antwortete nicht – Versuch ${importProgress.attempt} von 3)`}
                  </p>
                </div>
              )}
              {importMessage && (
                <p className="text-sm text-zinc-300">{importMessage}</p>
              )}
            </div>
          )}
        </div>

        {/* Rollen-Kategorien */}
        <div className="bg-zinc-900/70 border border-white/10 rounded-2xl p-4">
          <h2 className="font-medium mb-3">Karten nach Rolle</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {categories.map((group) => (
              <div
                key={group.category}
                className="bg-zinc-800 rounded-md px-3 py-2 flex items-center justify-between"
              >
                <span className="text-sm text-zinc-300">{group.category}</span>
                <span className="text-sm font-semibold">{group.cards.length}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="font-medium text-lg">
              Kartenliste {loadingOwnership && (
                <span className="text-xs font-normal text-zinc-500">(prüfe Freunde...)</span>
              )}
            </h2>
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
              <CardViewToggle mode={cardView} onChange={setCardView} allowList />
            </div>
          </div>
          <div className="space-y-5">
            {typeGroups.map((g) => (
              <section key={g.key} aria-label={g.label}>
                <h3 className="flex items-baseline gap-2 mb-2 text-sm font-semibold text-zinc-300">
                  {g.label}
                  <span className="text-xs font-normal text-zinc-500 tabular-nums">{g.count}</span>
                </h3>
                {cardView === "list" ? (
                  <ul className="rounded-xl border border-white/10 bg-zinc-900/60 divide-y divide-white/5 overflow-hidden">
                    {g.stacks.map((group) => {
                      const card = group[0];
                      const count = group.length;
                      const owners = ownership[card.name];
                      return (
                        <li key={card.id} className="flex items-center gap-3 px-3 py-2">
                          <button
                            onClick={() =>
                              selectMode
                                ? !card.is_commander && setSelected((sel) => toggle(sel, card.id))
                                : setViewKey(card.id)
                            }
                            aria-label={selectMode ? `${card.name} ${selected.has(card.id) ? "abwählen" : "auswählen"}` : `${card.name} ansehen`}
                            aria-pressed={selectMode ? selected.has(card.id) : undefined}
                            className="flex items-center gap-3 min-w-0 flex-1 text-left rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                          >
                          {selectMode && (card.is_commander ? <span className="w-6 shrink-0" /> : <SelectCheck selected={selected.has(card.id)} className="shrink-0" />)}
                          <span className="shrink-0 w-10 h-14 rounded-[4px] overflow-hidden bg-zinc-800">
                            {card.image_url && (
                              <Image src={card.image_url} alt="" width={40} height={56} className="w-full h-full object-cover" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              {count > 1 && <span className="text-xs text-zinc-500 tabular-nums">{count}×</span>}
                              <span className="truncate text-sm font-medium">{card.name}</span>
                              <ManaCost cost={card.mana_cost} size="xs" />
                            </span>
                            {owners?.length ? (
                              <span
                                className="block text-xs text-sky-400 truncate"
                                title={`${owners.map((o) => o.friendEmail.split("@")[0]).join(", ")} hat diese Karte`}
                              >
                                👥 {owners.map((o) => o.friendEmail.split("@")[0]).join(", ")}
                              </span>
                            ) : (
                              <span className="block text-xs text-zinc-500 truncate">{card.type_line}</span>
                            )}
                          </span>
                          </button>
                          <span className="shrink-0 text-sm tabular-nums text-emerald-400">
                            {card.price_eur !== null ? formatEur(card.price_eur) : "–"}
                          </span>
                          {!card.is_commander && !selectMode && (
                            <button
                              onClick={() => removeDeckCard(card.id, card.name)}
                              title={count > 1 ? "Eine Kopie aus dem Deck entfernen" : "Aus Deck entfernen"}
                              aria-label={`${card.name} aus dem Deck entfernen`}
                              className="shrink-0 grid place-items-center w-8 h-8 rounded-full text-zinc-500 hover:text-white hover:bg-red-600/80 transition"
                            >
                              ✕
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2 sm:gap-3">
                    {g.stacks.map((group) => {
                      const card = group[0];
                      const count = group.length;
                      const owners = ownership[card.name];
                      return (
                        <div key={card.id} className="relative">
                          <button
                            onClick={() =>
                              selectMode
                                ? !card.is_commander && setSelected((sel) => toggle(sel, card.id))
                                : setViewKey(card.id)
                            }
                            aria-label={selectMode ? `${card.name} ${selected.has(card.id) ? "abwählen" : "auswählen"}` : `${card.name} ansehen`}
                            aria-pressed={selectMode ? selected.has(card.id) : undefined}
                            className={`relative block w-full rounded-[4.75%/3.5%] overflow-hidden bg-zinc-900 shadow-md shadow-black/40 transition hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                              selectMode && selected.has(card.id) ? "ring-2 ring-indigo-400" : ""
                            } ${selectMode && card.is_commander ? "opacity-50" : ""}`}
                          >
                            {card.image_url ? (
                              <Image
                                src={card.image_url}
                                alt={card.name}
                                width={244}
                                height={340}
                                className="w-full h-auto"
                              />
                            ) : (
                              <div className="aspect-[244/340] flex items-center justify-center text-zinc-600 text-sm p-2 text-center">
                                {card.name}
                              </div>
                            )}
                            <QuantityBadge count={count} />
                          </button>
                          {selectMode && !card.is_commander && (
                            <SelectCheck selected={selected.has(card.id)} className="pointer-events-none absolute top-1.5 left-1.5 z-10" />
                          )}
                          {!card.is_commander && !selectMode && (
                            <button
                              onClick={() => removeDeckCard(card.id, card.name)}
                              title={count > 1 ? "Eine Kopie aus dem Deck entfernen" : "Aus Deck entfernen"}
                              aria-label={`${card.name} aus dem Deck entfernen`}
                              className="absolute top-1.5 left-1.5 z-10 bg-black/60 hover:bg-red-600 transition rounded-full w-6 h-6 text-xs opacity-70 hover:opacity-100"
                            >
                              ✕
                            </button>
                          )}
                          {/* Infozeile unter dem Bild statt Beschriftungen auf der Karte */}
                          {cardView === "details" && (
                            <div className="flex items-center justify-between gap-1 px-0.5 pt-1.5 text-[11px]">
                              <span className="tabular-nums font-medium text-emerald-400">
                                {card.price_eur !== null ? formatEur(card.price_eur) : "–"}
                              </span>
                              {owners?.length ? (
                                <span
                                  className="text-sky-400 truncate"
                                  title={`${owners.map((o) => o.friendEmail.split("@")[0]).join(", ")} hat diese Karte`}
                                >
                                  👥 {owners.map((o) => o.friendEmail.split("@")[0]).join(", ")}
                                </span>
                              ) : null}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            ))}
          </div>
        </div>
        </>
      )}

      {tab === "test" && (
        <>
        {/* Playtester / Goldfishing */}
        <PlaytestClient
          cards={initialCards.map((c) => ({
            id: c.id,
            name: c.name,
            image_url: c.image_url,
            type_line: c.type_line,
            is_commander: c.is_commander,
          }))}
        />

        </>
      )}

      {tab === "history" && (
        <>
        {/* Deckwert-Verlauf */}
        {valueHistory.length >= 2 && (
          <div className="bg-zinc-900/70 border border-white/10 rounded-2xl p-4">
            <h2 className="font-medium mb-3">Deckwert-Verlauf</h2>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={valueHistory.map((p) => ({
                    date: formatDate(p.captured_on),
                    Wert: Number(p.total_value_eur),
                  }))}
                >
                  <CartesianGrid stroke="#27272a" />
                  <XAxis dataKey="date" stroke="#71717a" fontSize={11} />
                  <YAxis stroke="#71717a" fontSize={11} />
                  <Tooltip
                    contentStyle={{ background: "#18181b", border: "1px solid #3f3f46" }}
                    formatter={(v: number) => formatEur(v)}
                  />
                  <Line type="monotone" dataKey="Wert" stroke="#34d399" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
          {valueHistory.length < 2 && (
            <p className="text-sm text-zinc-500">
              Der Deckwert wird jede Nacht gespeichert – der Verlauf erscheint ab dem zweiten Tag.
            </p>
          )}
        </>
      )}
      {selectMode && tab === "cards" && (
        <>
          <div className="h-24" aria-hidden />
          <SelectionBar
            count={selected.size}
            total={viewerStacks.filter((st) => !st[0].is_commander).length}
            onToggleAll={() =>
              setSelected((sel) => toggleAll(sel, viewerStacks.filter((st) => !st[0].is_commander).map((st) => st[0].id)))
            }
            onCancel={() => {
              setSelectMode(false);
              setSelected(new Set());
            }}
            onConfirm={() => void removeSelected()}
            actionLabel="Aus Deck"
            confirmText="{n} Karten (jeweils alle Kopien) aus dem Deck entfernen? Sie bleiben in deiner Sammlung."
            busy={removing}
          />
        </>
      )}

      {viewIndex >= 0 && (
        <CardViewer
          cards={viewerCards}
          index={viewIndex}
          onIndexChange={(i) => setViewKey(viewerCards[i].key)}
          onClose={() => setViewKey(null)}
          info={(c) => {
            const owners = ownership[c.name];
            const isCommander = viewerStacks.find((st) => st[0].id === c.key)?.[0].is_commander;
            return (
              <div className="space-y-1 text-sm">
                {isCommander && <p className="text-amber-300">♛ Commander</p>}
                {owners?.length ? (
                  <p className="text-sky-400">👥 {owners.map((o) => o.friendEmail.split("@")[0]).join(", ")} hat sie</p>
                ) : null}
              </div>
            );
          }}
          actions={(c) => {
            const head = viewerStacks.find((st) => st[0].id === c.key)?.[0];
            if (!head || head.is_commander) return null;
            return (
              <button
                onClick={() => {
                  setViewKey(null);
                  void removeDeckCard(head.id, head.name);
                }}
                className={viewerButton.danger}
              >
                {(c.quantity ?? 1) > 1 ? "Eine Kopie aus dem Deck entfernen" : "Aus Deck entfernen"}
              </button>
            );
          }}
        />
      )}

      {(() => {
        const group = suggestView && suggestGroups.find((g) => g.category === suggestView.category);
        if (!suggestView || !group || !group.cards[suggestView.index]) return null;
        return (
          <CardViewer
            cards={group.cards.map((c) => ({ key: c.id, name: c.name, image_url: c.imageUrl, price_eur: c.eur }))}
            index={suggestView.index}
            onIndexChange={(index) => {
              setSuggestMsg(null);
              setSuggestView({ category: group.category, index });
            }}
            onClose={() => setSuggestView(null)}
            info={(vc) => {
              const c = group.cards.find((x) => x.id === vc.key);
              if (!c) return null;
              return (
                <div className="space-y-1 text-sm">
                  {suggestMsg && (
                    <p
                      className={`rounded-lg px-3 py-2 ${
                        suggestMsg.type === "success"
                          ? "bg-emerald-500/15 text-emerald-300"
                          : suggestMsg.type === "error"
                            ? "bg-red-500/15 text-red-300"
                            : "bg-sky-500/15 text-sky-300"
                      }`}
                      aria-live="polite"
                    >
                      {suggestMsg.text}
                    </p>
                  )}
                  <p className="text-indigo-300">Vorschlag: mehr {group.label}</p>
                  {c.ownedQuantity > 0 ? (
                    <p className="text-emerald-400">In deiner Sammlung ×{c.ownedQuantity}</p>
                  ) : (
                    <p className="text-zinc-500">Nicht in deiner Sammlung – landet auf der Wunschliste</p>
                  )}
                  {c.usedInDecks.length > 0 && <p className="text-zinc-400">In Decks: {c.usedInDecks.join(", ")}</p>}
                  {c.friendsOwning.length > 0 && (
                    <p className="text-sky-400">👥 {c.friendsOwning.map((f) => f.friendEmail.split("@")[0]).join(", ")}</p>
                  )}
                </div>
              );
            }}
            actions={(vc) => (
              <button onClick={() => void addSuggestion(vc.name)} className={viewerButton.primary}>
                + Hinzufügen
              </button>
            )}
          />
        );
      })()}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white/5 rounded-xl py-2">
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-zinc-500 text-xs">{label}</p>
    </div>
  );
}
