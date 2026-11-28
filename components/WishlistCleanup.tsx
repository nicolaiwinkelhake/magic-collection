"use client";

// Nach dem Hinzufügen zur Sammlung: Stehen dieselben Karten (auch in anderer
// Version) auf der Wunschliste, fragen, ob sie dort entfernt werden sollen.
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { selectAll } from "@/lib/supabase/selectAll";
import { wishlistMatches } from "@/lib/wishlistMatch";
import { haptic } from "@/lib/haptics";

type WishRow = { id: string; name: string; image_url: string | null };

export function WishlistCleanup({ names, onDone }: { names: string[]; onDone: () => void }) {
  const [matches, setMatches] = useState<WishRow[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!names.length) return onDone();
    const supabase = createClient();
    selectAll<WishRow>(() => supabase.from("wishlist").select("id, name, image_url").order("id"))
      .then((rows) => {
        if (cancelled) return;
        const m = wishlistMatches(rows, names);
        if (!m.length) return onDone();
        setMatches(m);
        setChecked(new Set(m.map((w) => w.id)));
      })
      .catch(() => { if (!cancelled) onDone(); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [names]);

  if (!matches) return null;

  // mehrere Versionen derselben Karte als eine Zeile
  const groups = new Map<string, WishRow[]>();
  for (const w of matches) groups.set(w.name, [...(groups.get(w.name) ?? []), w]);
  const toggle = (rows: WishRow[]) =>
    setChecked((c) => {
      const n = new Set(c);
      const on = rows.every((r) => n.has(r.id));
      rows.forEach((r) => (on ? n.delete(r.id) : n.add(r.id)));
      return n;
    });
  const count = Array.from(groups.values()).filter((rows) => rows.some((r) => checked.has(r.id))).length;

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/wishlist", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(checked) }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      haptic("error");
      setError("Entfernen hat nicht geklappt – bitte erneut versuchen.");
      return;
    }
    haptic("success");
    onDone();
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/75" onClick={onDone} role="dialog" aria-modal="true" aria-label="Von der Wunschliste nehmen?">
      <div
        className="w-full sm:max-w-md max-h-[85dvh] overflow-y-auto rounded-t-[2rem] sm:rounded-3xl bg-zinc-900 border border-white/10 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-4 animate-[sheet_280ms_cubic-bezier(.2,.8,.2,1)] sm:animate-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-1">
          <h2 className="font-semibold">Von der Wunschliste nehmen?</h2>
          <p className="text-sm text-zinc-400">
            <span className="text-emerald-300">✓ Zur Sammlung hinzugefügt.</span>{" "}
            {groups.size === 1 ? "Diese Karte steht" : "Diese Karten stehen"} noch auf deiner Wunschliste – auch andere Versionen zählen.
          </p>
        </div>
        <ul className="max-h-[45dvh] overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/5">
          {Array.from(groups.entries()).map(([name, rows]) => {
            const on = rows.every((r) => checked.has(r.id));
            return (
              <li key={name}>
                <button type="button" role="checkbox" aria-checked={on} onClick={() => toggle(rows)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/5">
                  {rows[0].image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={rows[0].image_url} alt="" className="w-8 h-11 shrink-0 rounded object-cover bg-zinc-800" />
                  ) : (
                    <span className="w-8 h-11 shrink-0 rounded bg-zinc-800" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{name}</span>
                    {rows.length > 1 && <span className="block text-xs text-zinc-500">{rows.length} Versionen auf der Wunschliste</span>}
                  </span>
                  <span aria-hidden className={`shrink-0 grid place-items-center w-6 h-6 rounded-md border text-sm ${on ? "bg-indigo-500 border-indigo-400 text-white" : "border-white/20"}`}>
                    {on ? "✓" : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onDone} className="btn-secondary">
            Behalten
          </button>
          <button type="button" onClick={() => void remove()} disabled={busy || count === 0} className="btn-primary">
            {busy ? "Entferne …" : `Entfernen${count ? ` (${count})` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
