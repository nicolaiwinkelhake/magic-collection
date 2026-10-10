"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Gemeinsame Navigation für alle Seiten. Handy: Leiste mit Menü-Knopf, das
// Menü öffnet sich als Liste unter der Leiste. Desktop: Hauptlinks direkt,
// der Rest unter "Mehr".

const MAIN = [
  { href: "/collection", label: "Sammlung", icon: "🗂️" },
  { href: "/decks", label: "Decks", icon: "🎴" },
  { href: "/commanders", label: "Commander", icon: "👑" },
  { href: "/discover", label: "Entdecken", icon: "🔭" },
  { href: "/scan", label: "Scannen", icon: "📷" },
];

const MORE = [
  { href: "/ai-deck-generator", label: "AI Deck Generator", icon: "🤖" },
  { href: "/wishlist", label: "Wunschliste", icon: "⭐" },
  { href: "/sets", label: "Sets", icon: "📦" },
  { href: "/trades", label: "Trades", icon: "🔁" },
  { href: "/loans", label: "Verliehen", icon: "🤝" },
  { href: "/stats", label: "Wertverlauf", icon: "📈" },
  { href: "/friends", label: "Freunde", icon: "👥" },
  { href: "/shared", label: "Geteilte Sammlungen", icon: "🔗" },
];

const HIDDEN_ON = ["/login", "/signup", "/auth"];

export function AppNav({ email }: { email: string | null }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  // Menü bei Seitenwechsel schließen.
  useEffect(() => {
    setOpen(false);
    setMoreOpen(false);
  }, [pathname]);

  if (!email || HIDDEN_ON.some((p) => pathname.startsWith(p))) return null;

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  async function logout() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const linkClass = (href: string) =>
    `rounded-md px-3 py-2 text-sm ${isActive(href) ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white hover:bg-zinc-900"}`;

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur pt-[env(safe-area-inset-top)]">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-2">
        <Link href="/collection" className="font-semibold whitespace-nowrap mr-2">
          🪄 <span className="hidden sm:inline">Magic Collection</span>
        </Link>

        {/* Desktop */}
        <nav className="hidden lg:flex items-center gap-1 flex-1" aria-label="Hauptmenü">
          {MAIN.map((l) => (
            <Link key={l.href} href={l.href} className={linkClass(l.href)} aria-current={isActive(l.href) ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
          <div className="relative">
            <button
              onClick={() => setMoreOpen((v) => !v)}
              aria-expanded={moreOpen}
              className={`rounded-md px-3 py-2 text-sm ${
                MORE.some((l) => isActive(l.href)) ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white"
              }`}
            >
              Mehr ▾
            </button>
            {moreOpen && (
              <div className="absolute left-0 mt-1 w-56 rounded-lg border border-zinc-800 bg-zinc-900 p-1 shadow-xl">
                {MORE.map((l) => (
                  <Link key={l.href} href={l.href} className={`block ${linkClass(l.href)}`}>
                    {l.icon} {l.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </nav>
        <div className="hidden lg:flex items-center gap-3 text-sm">
          <Link href="/account" className="text-zinc-400 hover:text-white max-w-[14rem] truncate" title={email}>
            {email}
          </Link>
          <button onClick={logout} className="text-red-400 hover:underline">
            Abmelden
          </button>
        </div>

        {/* Handy/Tablet */}
        <span className="flex-1 lg:hidden truncate text-sm text-zinc-400">
          {[...MAIN, ...MORE].find((l) => isActive(l.href))?.label ?? ""}
        </span>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Menü schließen" : "Menü öffnen"}
          className="lg:hidden rounded-md p-2 text-zinc-300 hover:bg-zinc-800"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>

      {open && (
        <nav
          id="mobile-menu"
          aria-label="Hauptmenü"
          className="lg:hidden border-t border-zinc-800 max-h-[calc(100dvh-3.5rem)] overflow-y-auto px-4 py-3 space-y-3"
        >
          <div className="grid grid-cols-2 gap-1">
            {[...MAIN, ...MORE].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={isActive(l.href) ? "page" : undefined}
                className={`${linkClass(l.href)} py-3`}
              >
                {l.icon} {l.label}
              </Link>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-zinc-800 pt-3 text-sm">
            <Link href="/account" className="text-zinc-400 truncate" title={email}>
              {email}
            </Link>
            <button onClick={logout} className="text-red-400 py-2">
              Abmelden
            </button>
          </div>
        </nav>
      )}
    </header>
  );
}
