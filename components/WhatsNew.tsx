"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LATEST_RELEASE, shouldShowRelease, type Release } from "@/lib/releaseNotes";
import { BrandEmblem } from "@/components/ui/Brand";

const LOCAL_KEY = "seen-release";
const META_KEY = "seen_release";

/**
 * "Neu in der App": nach einem Update mit neuen Funktionen einmal zeigen.
 * Gemerkt wird im Nutzerkonto (user_metadata) – auf einem zweiten Gerät
 * erscheint es nicht noch einmal – plus lokal als schnelle Abkürzung.
 */
export function WhatsNew() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [release, setRelease] = useState<Release | null>(null);

  useEffect(() => {
    let cancelled = false;
    let local: string | null = null;
    try { local = localStorage.getItem(LOCAL_KEY); } catch {}
    if (!shouldShowRelease(local)) return;

    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled || !data.user) return;
      const seen = (data.user.user_metadata?.[META_KEY] as string | undefined) ?? null;
      if (!shouldShowRelease(seen)) {
        try { localStorage.setItem(LOCAL_KEY, seen!); } catch {}
        return;
      }
      // Hinweis zum neuen App-Symbol (iPhone) zuerst – danach die Neuigkeiten
      const show = () => !cancelled && setRelease(LATEST_RELEASE);
      if (document.getElementById("icon-hint-title")) {
        const t = setInterval(() => {
          if (!document.getElementById("icon-hint-title")) { clearInterval(t); show(); }
        }, 500);
      } else {
        setTimeout(show, 600);
      }
    });
    return () => { cancelled = true; };
  }, [supabase]);

  if (!release) return null;

  const close = (href?: string) => {
    try { localStorage.setItem(LOCAL_KEY, release.id); } catch {}
    void supabase.auth.updateUser({ data: { [META_KEY]: release.id } });
    setRelease(null);
    if (href) router.push(href);
  };

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-end sm:place-items-center bg-black/65 backdrop-blur-sm px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="whats-new-title"
    >
      <div className="w-full max-w-md max-h-full flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-zinc-900 shadow-2xl animate-fade-up">
        <div className="relative shrink-0 overflow-hidden px-5 pt-5 pb-4 bg-gradient-to-br from-violet-500/25 via-zinc-900 to-fuchsia-500/10">
          <div className="flex items-center gap-3">
            <BrandEmblem className="h-12 w-auto drop-shadow-[0_4px_16px_rgba(139,92,246,0.5)]" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-200/80">Neu in der App</p>
              <h2 id="whats-new-title" className="text-lg font-bold leading-tight">{release.title}</h2>
            </div>
          </div>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-2 divide-y divide-white/5">
          {release.items.map((it) => (
            <li key={it.title} className="flex gap-3 py-3">
              <span className="text-2xl leading-none mt-0.5" aria-hidden>{it.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[15px]">{it.title}</p>
                <p className="text-sm text-zinc-400 mt-0.5">{it.text}</p>
                {it.href && (
                  <button onClick={() => close(it.href)} className="mt-1.5 text-sm font-medium text-violet-300 hover:text-violet-200">
                    Ansehen →
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        <div className="shrink-0 px-5 pb-5 pt-3 space-y-2 border-t border-white/5">
          <button onClick={() => close()} className="btn-primary w-full h-12">Los geht’s</button>
          <p className="text-center text-xs text-zinc-500">Alle Neuigkeiten jederzeit unter Mehr → Neuigkeiten</p>
        </div>
      </div>
    </div>
  );
}
