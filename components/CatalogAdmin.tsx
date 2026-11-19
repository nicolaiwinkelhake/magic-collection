"use client";

import { useState } from "react";
import { formatDate } from "@/lib/format";

type Meta = { updated_at?: string; done?: boolean; rows?: number; finished_at?: string; next?: number; error?: string };

// Wartung (nur Admins): Stand des Karten-Katalogs und Abgleich von Hand.
// Der Abgleich läuft sonst jede Nacht automatisch.
export function CatalogAdmin({ cards, names, count, error }: { cards: Meta | null; names: Meta | null; count: number | null; error: Meta | null }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg("Abgleich läuft – das dauert einige Minuten (läuft auch weiter, wenn du die Seite verlässt).");
    const res = await fetch("/api/cron/catalog?force=1").catch(() => null);
    const data = await res?.json().catch(() => null);
    setBusy(false);
    if (!res?.ok) setMsg(`Fehler: ${data?.error ?? "Server nicht erreichbar"}`);
    else if (data?.continued) setMsg(`${(data.rows ?? 0).toLocaleString("de-DE")} Karten gespeichert – der Rest läuft im Hintergrund weiter. Später neu laden.`);
    else setMsg(`Fertig: ${(data?.rows ?? 0).toLocaleString("de-DE")} Karten. Deutsche Namen folgen im Hintergrund.`);
  }

  return (
    <section className="surface p-4 space-y-2">
      <h2 className="font-medium">Karten-Katalog</h2>
      <p className="text-sm text-zinc-400">
        {count != null ? `${count.toLocaleString("de-DE")} Drucke in der Datenbank` : "Noch leer"}
        {cards?.finished_at ? ` · zuletzt vollständig ${formatDate(cards.finished_at)}` : ""}
        {cards && !cards.done && cards.next ? ` · läuft (Zeile ${cards.next.toLocaleString("de-DE")})` : ""}
      </p>
      <p className="text-sm text-zinc-400">
        Deutsche Namen: {names?.finished_at ? `${(names.rows ?? 0).toLocaleString("de-DE")} · ${formatDate(names.finished_at)}` : "noch nicht"}
      </p>
      {error?.error && <p className="text-xs text-amber-300">Letzter Fehler: {error.error}</p>}
      {msg && <p className="text-sm text-zinc-300">{msg}</p>}
      <button onClick={() => void run()} disabled={busy} className="btn-secondary h-10 px-4 text-sm">
        {busy ? "Läuft …" : "Jetzt abgleichen"}
      </button>
      <p className="text-xs text-zinc-500">Läuft sonst jede Nacht automatisch (Scryfall-Gesamtdatei).</p>
    </section>
  );
}
