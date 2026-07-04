"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { parseDeckList } from "@/lib/parseDeckList";
import { moxfieldCsvToEntries } from "@/lib/csv";
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
import { formatEur, formatDate } from "@/lib/format";
import type { Deck, DeckCard } from "@/lib/deckTypes";

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
  const csvRef = useRef<HTMLInputElement>(null);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [ownership, setOwnership] = useState<FriendOwnership>({});
  const [loadingOwnership, setLoadingOwnership] = useState(false);
  const [suggestGroups, setSuggestGroups] = useState<
    Array<{
      category: string;
      label: string;
      cards: { id: string; name: string; imageUrl: string | null; eur: number | null }[];
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
        body: JSON.stringify({ names: [name] }),
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
  const [editMsg, setEditMsg] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  async function saveDeckEdit() {
    setSavingEdit(true);
    setEditMsg(null);
    const body: Record<string, string> = {};
    if (newName.trim() && newName.trim() !== deck.name) body.name = newName.trim();
    if (newCommander.trim()) body.commanderName = newCommander.trim();
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

  const { stats, suggestions } = useMemo(
    () => analyzeDeck(initialCards, deck.color_identity ?? []),
    [initialCards, deck.color_identity]
  );

  const totalValue = useMemo(() => {
    return initialCards.reduce((sum, c) => sum + (c.price_eur ?? 0), 0);
  }, [initialCards]);

  const categories = useMemo(
    () => categorizeDeck(initialCards),
    [initialCards]
  );

  const formattedValue = formatEur(totalValue);

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
    if (!file) return;
    const content = await file.text();
    const entries = moxfieldCsvToEntries(content);
    if (!entries?.length) {
      setImportMessage("CSV konnte nicht gelesen werden. Bitte Moxfield-Format verwenden.");
      return;
    }
    setImporting(true);
    setImportMessage(null);
    const res = await fetch(`/api/decks/${deck.id}/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    });
    const data = await res.json();
    setImporting(false);
    if (!res.ok) { setImportMessage(`Fehler: ${data.error}`); return; }
    let msg = `${data.inserted} Karte(n) hinzugefügt.`;
    if (data.duplicates?.length) msg += ` Bereits im Deck: ${data.duplicates.join(", ")}.`;
    if (data.notFound?.length) msg += ` Nicht gefunden: ${data.notFound.join(", ")}`;
    setImportMessage(msg);
    if (csvRef.current) csvRef.current.value = "";
    router.refresh();
  }

  async function handleImport() {
    if (!importText.trim()) return;

    // CSV in Textarea erkannt → automatisch als Moxfield-CSV behandeln
    const csvEntries = moxfieldCsvToEntries(importText);
    if (csvEntries) {
      setImporting(true);
      setImportMessage(null);
      const res = await fetch(`/api/decks/${deck.id}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: csvEntries }),
      });
      const data = await res.json();
      setImporting(false);
      if (!res.ok) { setImportMessage(`Fehler: ${data.error}`); return; }
      let msg = `${data.inserted} Karte(n) hinzugefügt.`;
      if (data.duplicates?.length) msg += ` Bereits im Deck: ${data.duplicates.join(", ")}.`;
      if (data.notFound?.length) msg += ` Nicht gefunden: ${data.notFound.join(", ")}`;
      setImportMessage(msg);
      setImportText("");
      router.refresh();
      return;
    }

    const names = parseDeckList(importText).map((e) => e.name);
    if (!names.length) return;

    setImporting(true);
    setImportMessage(null);

    const res = await fetch(`/api/decks/${deck.id}/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ names }),
    });

    const data = await res.json();
    setImporting(false);

    if (!res.ok) {
      setImportMessage(`Fehler: ${data.error}`);
      return;
    }

    let msg = `${data.inserted} Karte(n) hinzugefügt.`;
    if (data.duplicates?.length) msg += ` Bereits im Deck: ${data.duplicates.join(", ")}.`;
    if (data.notFound?.length) msg += ` Nicht gefunden: ${data.notFound.join(", ")}`;
    setImportMessage(msg);
    setImportText("");
    router.refresh();
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <Link href="/decks" className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-white transition">
        ← Zurück zu Decks
      </Link>
      <header className="flex items-center gap-4">
        {deck.commander_image_url && (
          <Image
            src={deck.commander_image_url}
            alt={deck.commander_name}
            width={80}
            height={112}
            className="rounded-md"
          />
        )}
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">{deck.name}</h1>
          <p className="text-zinc-400">Commander: {deck.commander_name}</p>
        </div>
        <button
          onClick={() => setEditOpen((v) => !v)}
          className="text-sm text-indigo-400 hover:underline"
        >
          Bearbeiten
        </button>
      </header>

      {editOpen && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
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

      {/* Import */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <button
          onClick={() => setImportOpen(!importOpen)}
          className="text-indigo-400 font-medium"
        >
          {importOpen ? "Import schließen ▲" : "Karten zum Deck hinzufügen ▼"}
        </button>
        {importOpen && (
          <div className="mt-3 space-y-3">
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
              <label className="bg-zinc-800 border border-zinc-700 hover:border-zinc-500 transition rounded-md px-4 py-2 text-sm cursor-pointer">
                {importing ? "Importiere..." : "Moxfield CSV wählen"}
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
            {importMessage && (
              <p className="text-sm text-zinc-300">{importMessage}</p>
            )}
          </div>
        )}
      </div>

      {/* Analyse */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-4">
        <h2 className="font-medium text-lg">📊 Deck-Analyse</h2>
        <div className="grid grid-cols-3 sm:grid-cols-7 gap-3 text-center text-sm">
          <Stat label="Karten" value={stats.totalCards} />
          <Stat label="Länder" value={stats.lands} />
          <Stat label="Ramp" value={stats.ramp} />
          <Stat label="Removal" value={stats.removal} />
          <Stat label="Draw" value={stats.draw} />
          <Stat label="Ø Manawert" value={stats.avgCmc} />
          <div className="bg-zinc-800 rounded-md py-2 col-span-3 sm:col-span-1">
            <p className="text-lg font-semibold text-emerald-400">
              {formattedValue}
            </p>
            <p className="text-zinc-500 text-xs">Deckwert</p>
          </div>
        </div>

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

      {/* Commander-Bracket / Power-Level */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
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

      {/* Rollen-Kategorien */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
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
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
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

      {/* Scryfall-basierte Kartenvorschläge */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
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
              {group.cards.map((c) => (
                <div
                  key={c.id}
                  className="relative rounded-lg overflow-hidden bg-zinc-950 border border-zinc-800 group"
                >
                  {c.imageUrl ? (
                    <Image src={c.imageUrl} alt={c.name} width={244} height={340} className="w-full h-auto" />
                  ) : (
                    <div className="aspect-[244/340] flex items-center justify-center text-zinc-600 text-xs p-2 text-center">
                      {c.name}
                    </div>
                  )}
                  <button
                    onClick={() => addSuggestion(c.name)}
                    className="absolute inset-x-0 bottom-0 bg-indigo-600/90 hover:bg-indigo-500 transition text-xs py-1.5 font-medium opacity-0 group-hover:opacity-100"
                  >
                    + Hinzufügen
                  </button>
                  {c.eur !== null && (
                    <span className="absolute top-1 left-1 bg-black/70 text-[10px] rounded px-1.5 py-0.5">
                      {formatEur(c.eur)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Deckwert-Verlauf */}
      {valueHistory.length >= 2 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
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
      <div>
        <h2 className="font-medium text-lg mb-3">
          Kartenliste {loadingOwnership && (
            <span className="text-xs text-zinc-500">(prüfe Freunde...)</span>
          )}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {initialCards.map((card) => {
            const owners = ownership[card.name];
            return (
              <div
                key={card.id}
                className="relative rounded-lg overflow-hidden bg-zinc-900 border border-zinc-800"
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
                {card.is_commander && (
                  <span className="absolute top-1 left-1 bg-amber-600 text-xs rounded-full px-2 py-0.5">
                    Commander
                  </span>
                )}
                {!card.is_commander && (
                  <button
                    onClick={() => removeDeckCard(card.id, card.name)}
                    title="Aus Deck entfernen"
                    className="absolute top-1 right-1 z-10 bg-black/70 hover:bg-red-600 transition rounded-full w-6 h-6 text-xs"
                  >
                    ✕
                  </button>
                )}
                {owners?.length ? (
                  <div className="absolute bottom-7 inset-x-0 bg-emerald-700/90 text-xs px-2 py-1">
                    ✅ {owners.map((o) => o.friendEmail.split("@")[0]).join(", ")} hat
                    diese Karte
                  </div>
                ) : null}
                {card.price_eur !== null && (
                  <div className="absolute bottom-0 inset-x-0 bg-black/70 text-xs px-2 py-1">
                    {formatEur(card.price_eur)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-zinc-800 rounded-md py-2">
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-zinc-500 text-xs">{label}</p>
    </div>
  );
}
