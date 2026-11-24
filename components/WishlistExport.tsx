"use client";

// Wunschliste exportieren: Ordner wählen, angefragte Karten ausschließen,
// als Text (z. B. für Cardmarket-Wants, Moxfield, Archidekt) oder CSV –
// kopieren oder als Datei speichern/teilen.
import { useEffect, useMemo, useState } from "react";
import type { Folder } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { loadDrafts } from "@/lib/tradeBasket";
import { CARDMARKET_MAX_ENTRIES, selectForExport, splitLines, wishlistToCsv, wishlistToText, type ExportItem } from "@/lib/wishlistExport";
import { formatEur } from "@/lib/format";
import { haptic } from "@/lib/haptics";

const UNSORTED_KEY = "__unsorted";

export function WishlistExport({ items, folders, onClose }: { items: ExportItem[]; folders: Folder[]; onClose: () => void }) {
  const [checked, setChecked] = useState<Set<string>>(() => new Set([...folders.map((f) => f.id), UNSORTED_KEY]));
  const [excludeTrades, setExcludeTrades] = useState(false);
  const [requested, setRequested] = useState<Set<string> | null>(null);
  const [format, setFormat] = useState<"cardmarket" | "text" | "csv">("cardmarket");
  const [copiedPart, setCopiedPart] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Karten, die ich per Trade angefragt habe (offen) oder in einem Trade-Entwurf stehen
  useEffect(() => {
    const names = new Set<string>();
    for (const d of Object.values(loadDrafts())) for (const b of d.basket) names.add(b.card.name);
    createClient()
      .rpc("my_trades")
      .then(({ data }) => {
        for (const t of (data ?? []) as Array<{ status: string; i_am_proposer: boolean; proposer_id: string; items: Array<{ name: string; from_user_id: string }> }>) {
          if (t.status !== "pending" || !t.i_am_proposer) continue;
          for (const it of t.items ?? []) if (it.from_user_id !== t.proposer_id) names.add(it.name);
        }
        setRequested(names);
      });
  }, []);

  const hasUnsorted = items.some((i) => !i.folder_ids?.length);
  const picked = useMemo(
    () =>
      selectForExport(items, {
        folderIds: checked,
        unsorted: checked.has(UNSORTED_KEY),
        exclude: excludeTrades && requested ? requested : new Set(),
      }),
    [items, checked, excludeTrades, requested],
  );
  const requestedInList = requested ? items.filter((i) => requested.has(i.name)).length : 0;
  const value = picked.reduce((s, i) => s + (i.price_eur ?? 0), 0);
  const folderName = (id: string) => folders.find((f) => f.id === id)?.name;
  const content = () => (format === "csv" ? wishlistToCsv(picked, folderName) : wishlistToText(picked));
  // Cardmarket: höchstens 150 Einträge je Wants-Liste → in Teile aufteilen
  const parts = format === "cardmarket" ? splitLines(wishlistToText(picked)) : [];
  useEffect(() => setCopiedPart(null), [picked, format]);

  async function copyPart(i: number) {
    try {
      await navigator.clipboard.writeText(parts[i]);
      haptic("success");
      setCopiedPart(i);
      setMsg(null);
    } catch {
      setMsg("Kopieren hat nicht geklappt – nutze „Als Datei“.");
    }
  }

  function toggle(id: string) {
    setChecked((c) => {
      const n = new Set(c);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  const allKeys = [...folders.map((f) => f.id), ...(hasUnsorted ? [UNSORTED_KEY] : [])];
  const allOn = allKeys.every((k) => checked.has(k));

  async function copy() {
    try {
      await navigator.clipboard.writeText(content());
      haptic("success");
      setMsg(`✓ ${picked.length} Karten kopiert – jetzt z. B. in eine Cardmarket-Wants-Liste, Moxfield oder Archidekt einfügen.`);
    } catch {
      setMsg("Kopieren hat nicht geklappt – nutze „Als Datei“.");
    }
  }

  async function save() {
    const csv = format === "csv";
    const file = new File([content()], `wunschliste.${csv ? "csv" : "txt"}`, { type: csv ? "text/csv" : "text/plain" });
    // Handy: Teilen-Menü (Dateien, Mail, …); sonst normaler Download
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Wunschliste" });
        haptic("success");
        return;
      }
    } catch {
      return; // abgebrochen
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    haptic("success");
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/75" onClick={onClose} role="dialog" aria-modal="true" aria-label="Wunschliste exportieren">
      <div
        className="w-full sm:max-w-md max-h-[90dvh] overflow-y-auto rounded-t-[2rem] sm:rounded-3xl bg-zinc-900 border border-white/10 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-4 animate-[sheet_280ms_cubic-bezier(.2,.8,.2,1)] sm:animate-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">Wunschliste exportieren</h2>
          <button onClick={onClose} aria-label="Schließen" className="shrink-0 w-9 h-9 rounded-full bg-white/10">
            ✕
          </button>
        </div>

        {(folders.length > 0 || hasUnsorted) && (
          <section className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-zinc-400">Ordner</span>
              <button type="button" onClick={() => setChecked(allOn ? new Set() : new Set(allKeys))} className="text-xs text-indigo-300">
                {allOn ? "Keine" : "Alle"}
              </button>
            </div>
            <ul className="max-h-[35dvh] overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/5">
              {[...folders.map((f) => ({ id: f.id, name: f.name, icon: "📁" })), ...(hasUnsorted ? [{ id: UNSORTED_KEY, name: "Ohne Ordner", icon: "🗂️" }] : [])].map((f) => {
                const on = checked.has(f.id);
                const count = f.id === UNSORTED_KEY ? items.filter((i) => !i.folder_ids?.length).length : items.filter((i) => i.folder_ids?.includes(f.id)).length;
                return (
                  <li key={f.id}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => toggle(f.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/5"
                    >
                      <span aria-hidden>{f.icon}</span>
                      <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
                      <span className="shrink-0 text-xs text-zinc-500 tabular-nums">{count}</span>
                      <span
                        aria-hidden
                        className={`shrink-0 grid place-items-center w-6 h-6 rounded-md border text-sm ${on ? "bg-indigo-500 border-indigo-400 text-white" : "border-white/20"}`}
                      >
                        {on ? "✓" : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <button
          type="button"
          role="switch"
          aria-checked={excludeTrades}
          onClick={() => setExcludeTrades((v) => !v)}
          className="w-full flex items-center gap-3 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm">Angefragte Karten ausschließen</span>
            <span className="block text-xs text-zinc-500">
              {requested == null
                ? "Lade offene Trades …"
                : requestedInList
                  ? `${requestedInList} ${requestedInList === 1 ? "Karte steckt" : "Karten stecken"} in offenen Trade-Anfragen oder Entwürfen`
                  : "Keine Karte der Wunschliste ist gerade per Trade angefragt"}
            </span>
          </span>
          <span className={`relative shrink-0 w-11 h-6 rounded-full transition ${excludeTrades ? "bg-indigo-500" : "bg-white/15"}`}>
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${excludeTrades ? "left-[1.375rem]" : "left-0.5"}`} />
          </span>
        </button>

        <section className="space-y-1.5">
          <span className="text-xs text-zinc-400">Format</span>
          <div className="segmented" role="group" aria-label="Format">
            <button type="button" onClick={() => setFormat("cardmarket")} aria-pressed={format === "cardmarket"} className={`segment ${format === "cardmarket" ? "segment-active" : ""}`}>
              Cardmarket
            </button>
            <button type="button" onClick={() => setFormat("text")} aria-pressed={format === "text"} className={`segment ${format === "text" ? "segment-active" : ""}`}>
              Text
            </button>
            <button type="button" onClick={() => setFormat("csv")} aria-pressed={format === "csv"} className={`segment ${format === "csv" ? "segment-active" : ""}`}>
              CSV
            </button>
          </div>
          <p className="text-xs text-zinc-500">
            {format === "cardmarket"
              ? `„1 Kartenname“ je Zeile, englische Namen. Cardmarket erlaubt höchstens ${CARDMARKET_MAX_ENTRIES} Karten je Wants-Liste – längere Listen werden aufgeteilt.`
              : format === "text"
                ? "„1 Kartenname“ je Zeile – z. B. für Moxfield, Archidekt und Co."
                : "Tabelle mit Name, Anzahl, Preis und Ordnern – z. B. für Excel."}
          </p>
        </section>

        <p className="text-sm">
          <b>{picked.length}</b> {picked.length === 1 ? "Karte" : "Karten"} · Wert <span className="text-emerald-400">{formatEur(value)}</span>
        </p>
        {msg && <p className="text-sm text-emerald-300" aria-live="polite">{msg}</p>}

        {format === "cardmarket" && picked.length > 0 && (
          <section className="space-y-2">
            <ol className="list-decimal pl-5 text-xs text-zinc-400 space-y-0.5">
              <li>Bei Cardmarket: <b>Kaufen → Wants</b> (engl. „Buying → My Wants“), eine neue Liste anlegen{parts.length > 1 ? " (für jeden Teil eine eigene)" : ""}.</li>
              <li>Die Liste öffnen, Karten unten kopieren und in das Feld für Decklisten einfügen.</li>
              <li>Den grünen Knopf <b>„Add“</b> drücken.</li>
            </ol>
            <div className="grid gap-2">
              {parts.map((p, i) => {
                const n = p.split("\n").length;
                const from = i * CARDMARKET_MAX_ENTRIES + 1;
                return (
                  <button key={i} type="button" onClick={() => void copyPart(i)} className={copiedPart === i ? "btn-secondary" : "btn-primary"}>
                    {copiedPart === i ? "✓ Kopiert – " : "Kopieren – "}
                    {parts.length > 1 ? `Teil ${i + 1} (Karte ${from}–${from + n - 1})` : `${n} ${n === 1 ? "Karte" : "Karten"}`}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <div className={`grid gap-2 ${format === "cardmarket" ? "grid-cols-1" : "grid-cols-2"}`}>
          {format !== "cardmarket" && (
          <button type="button" onClick={() => void copy()} disabled={!picked.length} className="btn-primary">
            Kopieren
          </button>
          )}
          <button type="button" onClick={() => void save()} disabled={!picked.length} className="btn-secondary">
            Als Datei
          </button>
        </div>
      </div>
    </div>
  );
}
