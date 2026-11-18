"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatEur } from "@/lib/format";
import {
  CONDITIONS,
  adText,
  bundleSuggestion,
  cardmarketListText,
  cardmarketSuggestion,
  conditionLabel,
  languageLabel,
  marketPrice,
  marketTotal,
  splitRevenue,
  type SellCard,
} from "@/lib/sell";

type Card = SellCard & {
  id: string;
  scryfall_id: string | null;
  image_url: string | null;
  quantity: number;
};
type Entry = { id: string; folder_id: string; asking_price: number | null; sell_quantity: number | null; card: Card };
type Folder = { id: string; name: string; parent_id: string | null; channel: string | null; asking_price: number | null };
type State = { roots: { cardmarket: Folder; kleinanzeigen: Folder }; ads: Folder[]; entries: Entry[] };
type Sale = { id: string; channel: string; listing: string | null; name: string; set_code: string | null; collector_number: string | null; foil: boolean; condition: string | null; quantity: number; price_eur: number | null; sold_at: string };

type Tab = "cardmarket" | "kleinanzeigen" | "sold";
const TAB_KEY = "sell-tab";

const num = (v: unknown) => (v == null || v === "" ? null : Number(v));
const qtyOf = (e: Entry) => Math.min(e.sell_quantity ?? e.card.quantity, e.card.quantity);
const cardmarketLink = (name: string) => `https://www.cardmarket.com/de/Magic/Products/Search?searchString=${encodeURIComponent(name)}`;
const KLEINANZEIGEN_NEW = "https://www.kleinanzeigen.de/p-anzeige-aufgeben.html";

async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
  const data = await res?.json().catch(() => null);
  if (!res?.ok) throw new Error(data?.error ?? "Das hat nicht geklappt");
  return data;
}

export function SellClient() {
  const [tab, setTab] = useState<Tab>("cardmarket");
  const [state, setState] = useState<State | null>(null);
  const [sales, setSales] = useState<Sale[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api("/api/sell", "GET");
      d.entries = (d.entries as Entry[]).map((e) => ({
        ...e,
        asking_price: num(e.asking_price),
        card: { ...e.card, price_eur: num(e.card.price_eur), price_eur_foil: num(e.card.price_eur_foil) },
      }));
      d.ads = (d.ads as Folder[]).map((a) => ({ ...a, asking_price: num(a.asking_price) }));
      setState(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Laden fehlgeschlagen");
    }
  }, []);
  const loadSales = useCallback(async () => {
    try {
      const d = await api("/api/sell/history", "GET");
      setSales((d.sales as Sale[]).map((s) => ({ ...s, price_eur: num(s.price_eur) })));
    } catch {
      setSales([]);
    }
  }, []);

  useEffect(() => {
    try {
      const t = localStorage.getItem(TAB_KEY) as Tab | null;
      if (t === "cardmarket" || t === "kleinanzeigen" || t === "sold") setTab(t);
    } catch {}
    void load();
  }, [load]);
  useEffect(() => {
    if (tab === "sold" && sales === null) void loadSales();
  }, [tab, sales, loadSales]);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3500);
    return () => clearTimeout(t);
  }, [msg]);

  const pick = (t: Tab) => {
    setTab(t);
    try { localStorage.setItem(TAB_KEY, t); } catch {}
  };

  // Lokale Änderung sofort zeigen, Server nachziehen
  async function run(fn: () => Promise<unknown>, done?: string, reload = true) {
    setBusy(true);
    try {
      await fn();
      if (done) setMsg(done);
      if (reload) await load();
      setSales(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Das hat nicht geklappt");
    } finally {
      setBusy(false);
    }
  }
  const patchEntry = (e: Entry, changes: Partial<Pick<Entry, "asking_price" | "sell_quantity" | "folder_id">>) => {
    setState((s) => s && { ...s, entries: s.entries.map((x) => (x.id === e.id ? { ...x, ...changes } : x)) });
    return run(() => api("/api/sell/entries", "PATCH", { id: e.id, ...changes }), undefined, "folder_id" in changes);
  };
  const setCondition = (e: Entry, condition: string) => {
    setState((s) => s && { ...s, entries: s.entries.map((x) => (x.card.id === e.card.id ? { ...x, card: { ...x.card, condition } } : x)) });
    return run(() => api("/api/cards", "PATCH", { id: e.card.id, condition }), undefined, false);
  };
  const removeFromSale = (ids: string[]) => run(() => api("/api/sell/entries", "DELETE", { ids }), "Aus dem Verkauf genommen – bleibt in der Sammlung");
  const sell = (items: Array<{ entry_id: string; quantity: number; price: number | null }>, label: string) =>
    run(() => api("/api/sell/sold", "POST", { items }), label);

  const cmEntries = useMemo(() => state?.entries.filter((e) => e.folder_id === state.roots.cardmarket.id) ?? [], [state]);
  const kaLoose = useMemo(() => state?.entries.filter((e) => e.folder_id === state.roots.kleinanzeigen.id) ?? [], [state]);
  const adsWithEntries = useMemo(
    () => (state?.ads ?? []).map((ad) => ({ ad, entries: state!.entries.filter((e) => e.folder_id === ad.id) })),
    [state],
  );

  return (
    <main className="page max-w-3xl space-y-4">
      <PageHeader title="Extern verkaufen" subtitle="Karten für Cardmarket und Kleinanzeigen vorbereiten" />

      <nav className="segmented" aria-label="Verkaufskanäle">
        {([
          ["cardmarket", `Cardmarket${cmEntries.length ? ` · ${cmEntries.length}` : ""}`],
          ["kleinanzeigen", `Kleinanzeigen${state ? ` · ${state.ads.length}` : ""}`],
          ["sold", "Verkauft"],
        ] as Array<[Tab, string]>).map(([k, l]) => (
          <button key={k} onClick={() => pick(k)} className={`segment ${tab === k ? "segment-active" : ""}`} aria-pressed={tab === k}>
            {l}
          </button>
        ))}
      </nav>

      {error && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}
      {!state && !error && <p className="text-sm text-zinc-500">Lade …</p>}

      {state && tab === "cardmarket" && (
        <CardmarketTab
          folder={state.roots.cardmarket}
          entries={cmEntries}
          busy={busy}
          onPrice={(e, p) => patchEntry(e, { asking_price: p })}
          onQty={(e, q) => patchEntry(e, { sell_quantity: q })}
          onCondition={setCondition}
          onRemove={(e) => removeFromSale([e.id])}
          onSell={sell}
          onCopied={() => setMsg("Liste kopiert")}
        />
      )}

      {state && tab === "kleinanzeigen" && (
        <KleinanzeigenTab
          root={state.roots.kleinanzeigen}
          loose={kaLoose}
          ads={adsWithEntries}
          busy={busy}
          onNewAd={(name) => run(() => api("/api/sell/ads", "POST", { name }), `Anzeige „${name}“ angelegt`)}
          onRenameAd={(ad, name) => run(() => api("/api/sell/ads", "PATCH", { id: ad.id, name }))}
          onAdPrice={(ad, p) => {
            setState((s) => s && { ...s, ads: s.ads.map((a) => (a.id === ad.id ? { ...a, asking_price: p } : a)) });
            return run(() => api("/api/sell/ads", "PATCH", { id: ad.id, asking_price: p }), undefined, false);
          }}
          onDeleteAd={(ad) => run(() => api("/api/sell/ads", "DELETE", { id: ad.id }), "Anzeige aufgelöst – Karten bleiben in der Sammlung")}
          onMove={(e, folderId) => patchEntry(e, { folder_id: folderId })}
          onQty={(e, q) => patchEntry(e, { sell_quantity: q })}
          onCondition={setCondition}
          onRemove={(e) => removeFromSale([e.id])}
          onSell={sell}
          onCopied={(what) => setMsg(`${what} kopiert`)}
          onError={setError}
        />
      )}

      {tab === "sold" && <SoldTab sales={sales} />}

      {msg && (
        <div role="status" className="fixed left-1/2 -translate-x-1/2 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-50 rounded-full bg-zinc-800 border border-white/10 px-4 py-2 text-sm shadow-lg">
          {msg}
        </div>
      )}
    </main>
  );
}

/* ---------------------------------------------------------------- */

function Empty({ folderName, text }: { folderName: string; text: string }) {
  return (
    <div className="surface p-5 text-sm text-zinc-300 space-y-2">
      <p>{text}</p>
      <p className="text-zinc-400">
        So kommen Karten hinein: In der <b>Sammlung</b> eine Karte antippen → <b>„Ordner“</b> → <b>„{folderName}“</b>. Mehrere
        Karten auf einmal: „Auswählen“ → Karten antippen → „Ordner“.
      </p>
      <Link href="/collection" className="btn-secondary h-10 mt-1 inline-flex">Zur Sammlung</Link>
    </div>
  );
}

function CardRow({
  e,
  priceSlot,
  actions,
  onQty,
  onCondition,
}: {
  e: Entry;
  priceSlot?: React.ReactNode;
  actions: React.ReactNode;
  onQty: (e: Entry, q: number | null) => void;
  onCondition: (e: Entry, c: string) => void;
}) {
  const c = e.card;
  const q = qtyOf(e);
  const market = marketPrice(c);
  return (
    <li className="flex gap-3 px-3 py-3">
      <span className="shrink-0 w-12 h-[67px] rounded-[5px] overflow-hidden bg-zinc-800">
        {c.image_url && <Image src={c.image_url} alt="" width={48} height={67} className="w-full h-full object-cover" />}
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{c.name}</p>
            <p className="text-xs text-zinc-500 truncate">
              <span className="uppercase">{c.set_code}</span>
              {c.collector_number && ` #${c.collector_number}`}
              {c.foil && <span className="text-fuchsia-300"> · Foil</span>}
              {` · ${languageLabel(c.language)}`}
              {market != null && <span className="text-zinc-400"> · Markt {formatEur(market)}</span>}
            </p>
          </div>
          {priceSlot}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <select
            value={(c.condition ?? "NM").toUpperCase()}
            onChange={(ev) => onCondition(e, ev.target.value)}
            aria-label={`Zustand von ${c.name}`}
            title={conditionLabel(c.condition)}
            className="h-8 rounded-lg bg-white/[0.06] border border-white/10 px-1.5 text-xs text-zinc-200"
          >
            {CONDITIONS.map((x) => (
              <option key={x.code} value={x.code}>{x.code}</option>
            ))}
          </select>
          {c.quantity > 1 && (
            <span className="inline-flex items-center rounded-lg bg-white/[0.06] border border-white/10 h-8 text-xs" aria-label="Menge im Verkauf">
              <button className="w-6 h-full" disabled={q <= 1} onClick={() => onQty(e, q - 1)} aria-label="Eine weniger">−</button>
              <span className="tabular-nums px-0.5" title={`${q} von ${c.quantity} im Verkauf`}>{q}/{c.quantity}</span>
              <button className="w-6 h-full" disabled={q >= c.quantity} onClick={() => onQty(e, q + 1 >= c.quantity ? null : q + 1)} aria-label="Eine mehr">+</button>
            </span>
          )}
          <span className="flex-1 min-w-0" />
          <span className="flex items-center gap-1.5">{actions}</span>
        </div>
      </div>
    </li>
  );
}

function PriceInput({ value, suggestion, onSave, label }: { value: number | null; suggestion: number | null; onSave: (p: number | null) => void; label: string }) {
  const [text, setText] = useState(value != null ? String(value).replace(".", ",") : "");
  useEffect(() => setText(value != null ? String(value).replace(".", ",") : ""), [value]);
  const commit = () => {
    const t = text.trim().replace(",", ".");
    const n = t === "" ? null : Number(t);
    if (n !== null && (!Number.isFinite(n) || n < 0)) return setText(value != null ? String(value).replace(".", ",") : "");
    if (n !== value) onSave(n === null ? null : Math.round(n * 100) / 100);
  };
  return (
    <label className="shrink-0 text-right">
      <span className="sr-only">{label}</span>
      <span className="flex items-center rounded-lg bg-white/[0.06] border border-white/10 focus-within:border-indigo-400/70 h-9 pr-2">
        <input
          inputMode="decimal"
          value={text}
          placeholder={suggestion != null ? String(suggestion.toFixed(2)).replace(".", ",") : "–"}
          onChange={(ev) => setText(ev.target.value)}
          onBlur={commit}
          onKeyDown={(ev) => ev.key === "Enter" && (ev.target as HTMLInputElement).blur()}
          className="w-[4.5rem] bg-transparent px-2 text-right text-sm tabular-nums text-emerald-300 placeholder:text-zinc-500 outline-none"
        />
        <span className="text-xs text-zinc-500">€</span>
      </span>
      {value == null && suggestion != null && <span className="block mt-0.5 text-[10px] text-zinc-500">Vorschlag</span>}
    </label>
  );
}

/* ---------------------------------------------------------------- */

function CardmarketTab({
  folder,
  entries,
  busy,
  onPrice,
  onQty,
  onCondition,
  onRemove,
  onSell,
  onCopied,
}: {
  folder: Folder;
  entries: Entry[];
  busy: boolean;
  onPrice: (e: Entry, p: number | null) => void;
  onQty: (e: Entry, q: number | null) => void;
  onCondition: (e: Entry, c: string) => void;
  onRemove: (e: Entry) => void;
  onSell: (items: Array<{ entry_id: string; quantity: number; price: number | null }>, label: string) => void;
  onCopied: () => void;
}) {
  if (!entries.length)
    return <Empty folderName={folder.name} text="Im Verkaufsordner für Cardmarket liegen noch keine Karten." />;

  const priceOf = (e: Entry) => e.asking_price ?? cardmarketSuggestion(e.card);
  const items = entries.map((e) => ({ card: e.card, quantity: qtyOf(e), price: priceOf(e) }));
  const count = items.reduce((s, i) => s + i.quantity, 0);
  const sum = items.reduce((s, i) => s + (i.price ?? 0) * i.quantity, 0);

  return (
    <div className="space-y-3">
      <div className="surface p-4 space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm text-zinc-400">
            {count} {count === 1 ? "Karte" : "Karten"} · Marktwert <span className="text-zinc-200">{formatEur(marketTotal(items))}</span>
          </p>
          <p className="text-sm">
            Dein Preis <span className="text-emerald-400 font-semibold">{formatEur(sum)}</span>
          </p>
        </div>
        <p className="text-xs text-zinc-500">
          Vorschlag = Cardmarket-Trendpreis des genauen Drucks (Foil getrennt), angepasst an den Zustand. Eigenen Preis einfach eintippen.
          Eingestellt wird auf Cardmarket selbst – „Cardmarket“ öffnet die Karte dort.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-secondary h-10"
            onClick={async () => {
              await navigator.clipboard?.writeText(cardmarketListText(items)).catch(() => {});
              onCopied();
            }}
          >
            Liste kopieren
          </button>
          <button
            className="btn-secondary h-10"
            disabled={busy}
            onClick={() => {
              if (!confirm(`Alle ${count} Karten als verkauft markieren? Sie werden aus der Sammlung ausgebucht.`)) return;
              onSell(entries.map((e) => ({ entry_id: e.id, quantity: qtyOf(e), price: priceOf(e) })), `${count} Karten als verkauft gebucht`);
            }}
          >
            Alle verkauft
          </button>
        </div>
      </div>

      <ul className="surface divide-y divide-white/5 overflow-hidden">
        {entries.map((e) => (
          <CardRow
            key={e.id}
            e={e}
            onQty={onQty}
            onCondition={onCondition}
            priceSlot={<PriceInput value={e.asking_price} suggestion={cardmarketSuggestion(e.card)} onSave={(p) => onPrice(e, p)} label={`Preis für ${e.card.name}`} />}
            actions={
              <>
                <a href={cardmarketLink(e.card.name)} target="_blank" rel="noreferrer" title="Auf Cardmarket öffnen" aria-label={`${e.card.name} auf Cardmarket öffnen`} className="h-8 inline-flex items-center rounded-lg px-2.5 text-xs bg-indigo-500/15 text-indigo-200 border border-indigo-400/30">
                  CM ↗
                </a>
                <button
                  className="h-8 rounded-lg px-2.5 text-xs bg-emerald-500/15 text-emerald-300 border border-emerald-400/30"
                  disabled={busy}
                  onClick={() => onSell([{ entry_id: e.id, quantity: qtyOf(e), price: priceOf(e) }], `${e.card.name} als verkauft gebucht`)}
                >
                  Verkauft
                </button>
                <button className="h-8 w-8 rounded-lg text-zinc-500 hover:text-white" title="Aus dem Verkauf nehmen" aria-label={`${e.card.name} aus dem Verkauf nehmen`} onClick={() => onRemove(e)}>
                  ✕
                </button>
              </>
            }
          />
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------------- */

function KleinanzeigenTab({
  root,
  loose,
  ads,
  busy,
  onNewAd,
  onRenameAd,
  onAdPrice,
  onDeleteAd,
  onMove,
  onQty,
  onCondition,
  onRemove,
  onSell,
  onCopied,
  onError,
}: {
  root: Folder;
  loose: Entry[];
  ads: Array<{ ad: Folder; entries: Entry[] }>;
  busy: boolean;
  onNewAd: (name: string) => void;
  onRenameAd: (ad: Folder, name: string) => void;
  onAdPrice: (ad: Folder, p: number | null) => void;
  onDeleteAd: (ad: Folder) => void;
  onMove: (e: Entry, folderId: string) => void;
  onQty: (e: Entry, q: number | null) => void;
  onCondition: (e: Entry, c: string) => void;
  onRemove: (e: Entry) => void;
  onSell: (items: Array<{ entry_id: string; quantity: number; price: number | null }>, label: string) => void;
  onCopied: (what: string) => void;
  onError: (m: string) => void;
}) {
  const newAd = () => {
    const name = window.prompt("Name der Anzeige (z. B. „Elfen-Bundle“ oder „Commander-Staples“):")?.trim();
    if (name) onNewAd(name);
  };

  return (
    <div className="space-y-3">
      <div className="surface p-4 space-y-2">
        <p className="text-sm text-zinc-300">
          Jede <b>Anzeige</b> ist ein Unterordner von „{root.name}“. Die App schreibt Titel und Beschreibung, macht ein Sammelfoto und
          schlägt einen Preis vor – eingestellt wird auf Kleinanzeigen selbst.
        </p>
        <button className="btn-primary h-10" onClick={newAd}>+ Neue Anzeige</button>
      </div>

      {loose.length > 0 && (
        <section className="surface overflow-hidden">
          <h2 className="px-4 pt-3 text-sm font-semibold">Noch keiner Anzeige zugeordnet · {loose.length}</h2>
          <ul className="divide-y divide-white/5">
            {loose.map((e) => (
              <CardRow
                key={e.id}
                e={e}
                onQty={onQty}
                onCondition={onCondition}
                actions={
                  <>
                    <select
                      defaultValue=""
                      onChange={(ev) => ev.target.value && onMove(e, ev.target.value)}
                      className="h-8 rounded-lg bg-indigo-500/15 border border-indigo-400/30 px-2 text-xs text-indigo-100"
                      aria-label={`${e.card.name} einer Anzeige zuordnen`}
                    >
                      <option value="">In Anzeige …</option>
                      {ads.map(({ ad }) => (
                        <option key={ad.id} value={ad.id}>{ad.name}</option>
                      ))}
                    </select>
                    <button className="h-8 w-8 rounded-lg text-zinc-500 hover:text-white" aria-label={`${e.card.name} aus dem Verkauf nehmen`} onClick={() => onRemove(e)}>✕</button>
                  </>
                }
              />
            ))}
          </ul>
        </section>
      )}

      {!ads.length && !loose.length && (
        <Empty folderName={`${root.name} › (Anzeige)`} text="Noch keine Anzeigen. Lege oben eine an und fülle sie dann aus der Sammlung." />
      )}

      {ads.map(({ ad, entries }) => (
        <AdCard
          key={ad.id}
          ad={ad}
          rootName={root.name}
          entries={entries}
          busy={busy}
          onRename={(n) => onRenameAd(ad, n)}
          onPrice={(p) => onAdPrice(ad, p)}
          onDelete={() => onDeleteAd(ad)}
          onQty={onQty}
          onCondition={onCondition}
          onRemove={onRemove}
          onSell={onSell}
          onCopied={onCopied}
          onError={onError}
        />
      ))}
    </div>
  );
}

function AdCard({
  ad,
  rootName,
  entries,
  busy,
  onRename,
  onPrice,
  onDelete,
  onQty,
  onCondition,
  onRemove,
  onSell,
  onCopied,
  onError,
}: {
  ad: Folder;
  rootName: string;
  entries: Entry[];
  busy: boolean;
  onRename: (n: string) => void;
  onPrice: (p: number | null) => void;
  onDelete: () => void;
  onQty: (e: Entry, q: number | null) => void;
  onCondition: (e: Entry, c: string) => void;
  onRemove: (e: Entry) => void;
  onSell: (items: Array<{ entry_id: string; quantity: number; price: number | null }>, label: string) => void;
  onCopied: (what: string) => void;
  onError: (m: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [photoBusy, setPhotoBusy] = useState(false);
  const items = entries.map((e) => ({ card: e.card, quantity: qtyOf(e) }));
  const count = items.reduce((s, i) => s + i.quantity, 0);
  const market = marketTotal(items);
  const suggestion = bundleSuggestion(market);
  const price = ad.asking_price ?? (suggestion || null);
  const text = adText(ad.name, items, price);

  async function copy(what: "Titel" | "Beschreibung" | "Anzeigentext") {
    const t = what === "Titel" ? text.title : what === "Beschreibung" ? text.description : `${text.title}\n\n${text.description}`;
    await navigator.clipboard?.writeText(t).catch(() => {});
    onCopied(what);
  }

  async function photo() {
    setPhotoBusy(true);
    try {
      const blob = await collage(entries.map((e) => e.card.image_url).filter(Boolean) as string[]);
      const file = new File([blob], `${ad.name.replace(/[^\wäöüÄÖÜß-]+/g, "_")}.jpg`, { type: "image/jpeg" });
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
      if (nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: text.title }).catch(() => {});
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
    } catch {
      onError("Sammelfoto konnte nicht erstellt werden – Kartenbilder ließen sich nicht laden.");
    } finally {
      setPhotoBusy(false);
    }
  }

  function soldAll() {
    const raw = window.prompt(`Ganze Anzeige „${ad.name}“ verkauft – für wie viel Euro?`, price != null ? String(price).replace(".", ",") : "");
    if (raw == null) return;
    const total = Number(raw.trim().replace(",", "."));
    if (!Number.isFinite(total) || total < 0) return onError("Bitte einen gültigen Betrag eingeben.");
    const per = splitRevenue(total, items);
    onSell(entries.map((e, i) => ({ entry_id: e.id, quantity: qtyOf(e), price: per[i] })), `„${ad.name}“ verkauft – ${count} Karten ausgebucht`);
  }

  function soldOne(e: Entry) {
    const suggestionOne = marketPrice(e.card);
    const raw = window.prompt(`${e.card.name} einzeln verkauft – Preis je Karte in Euro?`, suggestionOne != null ? String(suggestionOne).replace(".", ",") : "");
    if (raw == null) return;
    const p = raw.trim() === "" ? null : Number(raw.trim().replace(",", "."));
    if (p !== null && (!Number.isFinite(p) || p < 0)) return onError("Bitte einen gültigen Betrag eingeben.");
    onSell([{ entry_id: e.id, quantity: qtyOf(e), price: p }], `${e.card.name} als verkauft gebucht`);
  }

  return (
    <section className="surface overflow-hidden">
      <button className="w-full flex items-center gap-3 px-4 py-3 text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{ad.name}</span>
          <span className="block text-xs text-zinc-500">
            {count} {count === 1 ? "Karte" : "Karten"} · Marktwert {formatEur(market)}
          </span>
        </span>
        {price != null && <span className="text-emerald-400 font-semibold tabular-nums">{formatEur(price)} VB</span>}
        <span className={`text-zinc-500 transition ${open ? "rotate-180" : ""}`} aria-hidden>▾</span>
      </button>

      {open && (
        <div className="border-t border-white/5">
          {entries.length === 0 ? (
            <p className="px-4 py-3 text-sm text-zinc-400">
              Leer. In der Sammlung Karten antippen → „Ordner“ → „{rootName} › {ad.name}“.
            </p>
          ) : (
            <>
              <div className="px-4 py-3 space-y-3">
                <div className="flex items-end justify-between gap-3">
                  <p className="text-xs text-zinc-500 max-w-[16rem]">
                    Vorschlag {formatEur(suggestion)} – privat üblich etwa 10 % unter Cardmarket, gerundet. Eigener Preis:
                  </p>
                  <PriceInput value={ad.asking_price} suggestion={suggestion || null} onSave={onPrice} label={`Preis für Anzeige ${ad.name}`} />
                </div>
                <div className="rounded-xl bg-black/30 border border-white/5 p-3 text-xs text-zinc-300 space-y-1.5">
                  <p className="font-semibold text-zinc-100">{text.title}</p>
                  <p className="whitespace-pre-line text-zinc-400 max-h-40 overflow-y-auto">{text.description}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-secondary h-10" onClick={() => copy("Titel")}>Titel kopieren</button>
                  <button className="btn-secondary h-10" onClick={() => copy("Beschreibung")}>Beschreibung kopieren</button>
                  <button className="btn-secondary h-10" disabled={photoBusy} onClick={photo}>{photoBusy ? "Foto wird erstellt …" : "Sammelfoto"}</button>
                  <a className="btn-primary h-10" href={KLEINANZEIGEN_NEW} target="_blank" rel="noreferrer">Kleinanzeigen öffnen ↗</a>
                </div>
              </div>
              <ul className="divide-y divide-white/5 border-t border-white/5">
                {entries.map((e) => (
                  <CardRow
                    key={e.id}
                    e={e}
                    onQty={onQty}
                    onCondition={onCondition}
                    actions={
                      <>
                        <button className="h-8 rounded-lg px-2.5 text-xs bg-emerald-500/15 text-emerald-300 border border-emerald-400/30" disabled={busy} onClick={() => soldOne(e)}>
                          Verkauft
                        </button>
                        <button className="h-8 w-8 rounded-lg text-zinc-500 hover:text-white" aria-label={`${e.card.name} aus der Anzeige nehmen`} onClick={() => onRemove(e)}>✕</button>
                      </>
                    }
                  />
                ))}
              </ul>
            </>
          )}
          <div className="flex flex-wrap gap-2 px-4 py-3 border-t border-white/5">
            {entries.length > 0 && (
              <button className="btn-primary h-10" disabled={busy} onClick={soldAll}>Ganze Anzeige verkauft</button>
            )}
            <button
              className="btn-ghost h-10"
              onClick={() => {
                const n = window.prompt("Neuer Name der Anzeige:", ad.name)?.trim();
                if (n && n !== ad.name) onRename(n);
              }}
            >
              Umbenennen
            </button>
            <button
              className="btn-ghost h-10 text-red-300"
              onClick={() => confirm(`Anzeige „${ad.name}“ auflösen? Die Karten bleiben in deiner Sammlung.`) && onDelete()}
            >
              Auflösen
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- */

function SoldTab({ sales }: { sales: Sale[] | null }) {
  if (sales === null) return <p className="text-sm text-zinc-500">Lade …</p>;
  if (!sales.length) return <div className="surface p-5 text-sm text-zinc-400">Noch nichts verkauft.</div>;
  const total = sales.reduce((s, x) => s + (x.price_eur ?? 0) * x.quantity, 0);
  const count = sales.reduce((s, x) => s + x.quantity, 0);
  return (
    <div className="space-y-3">
      <div className="surface p-4 flex items-baseline justify-between">
        <p className="text-sm text-zinc-400">{count} {count === 1 ? "Karte" : "Karten"} verkauft</p>
        <p className="text-sm">Erlös <span className="text-emerald-400 font-semibold">{formatEur(total)}</span></p>
      </div>
      <ul className="surface divide-y divide-white/5 overflow-hidden">
        {sales.map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{s.quantity > 1 && <span className="text-zinc-500">{s.quantity}× </span>}{s.name}</span>
              <span className="block text-xs text-zinc-500 truncate">
                {s.channel === "cardmarket" ? "Cardmarket" : `Kleinanzeigen${s.listing ? ` · ${s.listing}` : ""}`} ·{" "}
                {new Date(s.sold_at).toLocaleDateString("de-DE")} · <span className="uppercase">{s.set_code}</span>
                {s.foil ? " · Foil" : ""} · {s.condition ?? "NM"}
              </span>
            </span>
            <span className="text-sm tabular-nums text-emerald-400">{s.price_eur != null ? formatEur(s.price_eur * s.quantity) : "–"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------------- */

/** Sammelfoto: Kartenbilder im Raster auf dunklem Grund, als JPEG. */
async function collage(urls: string[]): Promise<Blob> {
  const list = urls.slice(0, 24);
  if (!list.length) throw new Error("keine Bilder");
  const cols = list.length <= 4 ? 2 : list.length <= 9 ? 3 : 4;
  const rows = Math.ceil(list.length / cols);
  const W = 488, H = 680, GAP = 24;
  const canvas = document.createElement("canvas");
  canvas.width = cols * W + (cols + 1) * GAP;
  canvas.height = rows * H + (rows + 1) * GAP;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#0e0d14";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const imgs = await Promise.all(
    list.map(
      (u) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new window.Image();
          img.crossOrigin = "anonymous";
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = u;
        }),
    ),
  );
  imgs.forEach((img, i) => {
    const x = GAP + (i % cols) * (W + GAP);
    const y = GAP + Math.floor(i / cols) * (H + GAP);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, W, H, 22);
    ctx.clip();
    ctx.drawImage(img, x, y, W, H);
    ctx.restore();
  });
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/jpeg", 0.88));
}
