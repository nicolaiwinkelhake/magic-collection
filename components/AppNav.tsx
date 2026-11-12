"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Gemeinsame Navigation für alle Seiten.
// Handy/Tablet: Kopfzeile wie bei iOS – der Seitentitel erscheint klein,
// sobald man scrollt – und eine schwebende Tab-Leiste im Glas-Look unten
// (Sammlung, Decks, Scannen als Mittelknopf, Entdecken, Mehr). "Mehr" öffnet
// ein Blatt von unten mit allen weiteren Bereichen.
// Desktop: Hauptlinks oben, der Rest unter "Mehr".

type NavLink = { href: string; label: string; icon: IconName };

const MAIN: NavLink[] = [
  { href: "/collection", label: "Sammlung", icon: "collection" },
  { href: "/decks", label: "Decks", icon: "decks" },
  { href: "/commanders", label: "Commander", icon: "crown" },
  { href: "/discover", label: "Entdecken", icon: "discover" },
  { href: "/scan", label: "Scannen", icon: "scan" },
];

const MORE: NavLink[] = [
  { href: "/wishlist", label: "Wunschliste", icon: "star" },
  { href: "/ai-deck-generator", label: "AI Deck Generator", icon: "sparkles" },
  { href: "/sets", label: "Sets", icon: "box" },
  { href: "/trades", label: "Trades", icon: "swap" },
  { href: "/loans", label: "Verliehen", icon: "hand" },
  { href: "/stats", label: "Wertverlauf", icon: "chart" },
  { href: "/friends", label: "Freunde", icon: "users" },
  { href: "/shared", label: "Geteilte Sammlungen", icon: "link" },
];

// Tab-Leiste unten (Handy). Commander landet im "Mehr"-Blatt.
const TABS: NavLink[] = [
  { href: "/collection", label: "Sammlung", icon: "collection" },
  { href: "/decks", label: "Decks", icon: "decks" },
  { href: "/scan", label: "Scannen", icon: "scan" },
  { href: "/discover", label: "Entdecken", icon: "discover" },
];
const SHEET: NavLink[] = [{ href: "/commanders", label: "Commander", icon: "crown" }, ...MORE];

const HIDDEN_ON = ["/login", "/signup", "/auth", "/forgot-password", "/reset-password"];

export function AppNav({ email }: { email: string | null }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // Nach dem Scrollen: Glas-Hintergrund + kleiner Titel in der Kopfzeile
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 36);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [pathname]);

  // Menüs bei Seitenwechsel schließen.
  useEffect(() => {
    setSheetOpen(false);
    setMoreOpen(false);
  }, [pathname]);

  // Escape schließt das Blatt.
  useEffect(() => {
    if (!sheetOpen && !moreOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSheetOpen(false);
        setMoreOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen, moreOpen]);

  if (!email || HIDDEN_ON.some((p) => pathname.startsWith(p))) return null;

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const current = [...MAIN, ...MORE, { href: "/account", label: "Konto", icon: "user" as IconName }].find((l) =>
    isActive(l.href),
  );
  const sheetActive = SHEET.some((l) => isActive(l.href)) || isActive("/account");

  async function logout() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const desktopLink = (href: string) =>
    `flex items-center gap-2 rounded-xl px-3 h-9 text-sm font-medium transition ${
      isActive(href) ? "bg-white/10 text-white" : "text-zinc-400 hover:text-white hover:bg-white/5"
    }`;

  return (
    <>
      <header
        className={`sticky top-0 z-40 pt-[env(safe-area-inset-top)] transition-colors duration-300 ${
          scrolled ? "bg-[#0b0b10]/75 backdrop-blur-2xl border-b border-white/[0.06]" : "border-b border-transparent lg:bg-[#0b0b10]/60 lg:backdrop-blur-2xl"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-2">
          <Link href="/collection" className="flex items-center gap-2.5 font-semibold whitespace-nowrap mr-3" aria-label="Magic Collection">
            <Logo />
            <span className="hidden lg:inline tracking-tight">Magic Collection</span>
          </Link>

          {/* Desktop */}
          <nav className="hidden lg:flex items-center gap-1 flex-1" aria-label="Hauptmenü">
            {MAIN.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={desktopLink(l.href)}
                aria-current={isActive(l.href) ? "page" : undefined}
              >
                <Icon name={l.icon} className="w-4 h-4" />
                {l.label}
              </Link>
            ))}
            <div className="relative">
              <button
                onClick={() => setMoreOpen((v) => !v)}
                aria-expanded={moreOpen}
                className={`flex items-center gap-1 rounded-xl px-3 h-9 text-sm font-medium transition ${
                  MORE.some((l) => isActive(l.href)) ? "bg-white/10 text-white" : "text-zinc-400 hover:text-white"
                }`}
              >
                Mehr
                <Icon name="chevron" className="w-4 h-4" />
              </button>
              {moreOpen && (
                <>
                  <div className="fixed inset-0 z-0" onClick={() => setMoreOpen(false)} aria-hidden />
                  <div className="absolute left-0 z-10 mt-2 w-64 rounded-2xl border border-white/10 bg-zinc-900/90 backdrop-blur-2xl p-1.5 shadow-2xl shadow-black/60 animate-fade-up">
                    {MORE.map((l) => (
                      <Link key={l.href} href={l.href} className={desktopLink(l.href)}>
                        <Icon name={l.icon} className="w-4 h-4" />
                        {l.label}
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </div>
          </nav>
          <div className="hidden lg:flex items-center gap-3 text-sm">
            <Link
              href="/account"
              className="flex items-center gap-2 text-zinc-400 hover:text-white max-w-[14rem]"
              title={email}
            >
              <Avatar email={email} />
              <span className="truncate">{email}</span>
            </Link>
            <button onClick={logout} className="text-zinc-500 hover:text-red-400 transition">
              Abmelden
            </button>
          </div>

          {/* Handy/Tablet: Titel blendet beim Scrollen ein (großer Titel steht auf der Seite) */}
          <span
            className={`flex-1 lg:hidden truncate text-center font-semibold transition-all duration-300 ${
              scrolled ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"
            }`}
            aria-hidden={!scrolled}
          >
            {current?.label ?? ""}
          </span>
          <Link href="/account" className="lg:hidden" aria-label="Konto">
            <Avatar email={email} />
          </Link>
        </div>
      </header>

      {/* Schwebende Tab-Leiste unten (Handy/Tablet) */}
      <nav
        aria-label="Hauptmenü"
        className="lg:hidden fixed inset-x-3 bottom-[calc(0.5rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md"
      >
        <div className="grid grid-cols-5 items-center h-[4.25rem] px-1.5 rounded-[1.75rem] border border-white/10 bg-zinc-900/75 backdrop-blur-2xl shadow-2xl shadow-black/70 ring-1 ring-inset ring-white/[0.04]">
          {TABS.slice(0, 2).map((t) => (
            <TabLink key={t.href} link={t} active={isActive(t.href)} />
          ))}
          {/* Scannen: hervorgehobener Mittelknopf */}
          <Link
            href="/scan"
            aria-current={isActive("/scan") ? "page" : undefined}
            className="flex items-center justify-center"
            aria-label="Scannen"
          >
            <span
              className={`grid place-items-center w-[3.25rem] h-[3.25rem] rounded-[1.15rem] bg-gradient-to-br from-indigo-400 via-indigo-500 to-fuchsia-500 shadow-glow ring-1 ring-inset ring-white/25 transition active:scale-95 ${
                isActive("/scan") ? "ring-2 ring-white/60" : ""
              }`}
            >
              <Icon name="scan" className="w-6 h-6 text-white" />
            </span>
          </Link>
          <TabLink link={TABS[3]} active={isActive(TABS[3].href)} />
          <button
            onClick={() => setSheetOpen(true)}
            aria-expanded={sheetOpen}
            aria-controls="more-sheet"
            className="flex flex-col items-center justify-center"
          >
            <span
              className={`flex flex-col items-center gap-0.5 rounded-2xl px-3 py-1.5 transition ${
                sheetActive ? "bg-white/10 text-white" : "text-zinc-500"
              }`}
            >
              <Icon name="grid" className="w-[22px] h-[22px]" />
              <span className="text-[10px] font-medium">Mehr</span>
            </span>
          </button>
        </div>
      </nav>

      {/* "Mehr"-Blatt von unten */}
      {sheetOpen && (
        <div className="lg:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Weitere Bereiche">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSheetOpen(false)} aria-hidden />
          <div
            id="more-sheet"
            className="absolute bottom-0 inset-x-0 rounded-t-[2rem] border-t border-white/10 bg-zinc-900/95 backdrop-blur-2xl px-4 pt-2.5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] max-h-[85dvh] overflow-y-auto animate-[sheet_260ms_cubic-bezier(.2,.8,.2,1)]"
          >
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-white/15" aria-hidden />
            <Link
              href="/account"
              className="mb-4 flex items-center gap-3 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/10 border border-white/10 px-4 py-3"
              title={email}
            >
              <Avatar email={email} large />
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-zinc-400">Angemeldet als</span>
                <span className="block truncate font-medium">{email}</span>
              </span>
              <Icon name="chevron" className="w-5 h-5 -rotate-90 text-zinc-500" />
            </Link>
            <div className="grid grid-cols-3 gap-2.5">
              {SHEET.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={isActive(l.href) ? "page" : undefined}
                  className={`press flex flex-col items-center gap-2 rounded-2xl px-2 py-4 text-center text-xs font-medium transition ${
                    isActive(l.href)
                      ? "bg-indigo-500/20 text-white ring-1 ring-inset ring-indigo-400/40"
                      : "bg-white/[0.05] text-zinc-300 active:bg-white/10"
                  }`}
                >
                  <span className="grid place-items-center w-10 h-10 rounded-xl bg-white/[0.06]">
                    <Icon name={l.icon} className="w-[22px] h-[22px]" />
                  </span>
                  {l.label}
                </Link>
              ))}
            </div>
            <button onClick={logout} className="btn-ghost w-full mt-4 text-red-400 hover:text-red-300">
              <Icon name="logout" className="w-5 h-5" />
              Abmelden
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function TabLink({ link, active }: { link: NavLink; active: boolean }) {
  return (
    <Link
      href={link.href}
      aria-current={active ? "page" : undefined}
      className="flex flex-col items-center justify-center"
    >
      <span
        className={`flex flex-col items-center gap-0.5 rounded-2xl px-3 py-1.5 transition ${
          active ? "bg-white/10 text-white" : "text-zinc-500 active:text-zinc-300"
        }`}
      >
        <Icon name={link.icon} className="w-[22px] h-[22px]" />
        <span className="text-[10px] font-medium">{link.label}</span>
      </span>
    </Link>
  );
}

function Logo() {
  return (
    <span className="relative grid place-items-center w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-400 via-indigo-500 to-fuchsia-500 shadow-glow ring-1 ring-inset ring-white/25">
      <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 2.5l2.4 6.1 6.1 2.4-6.1 2.4L12 19.5l-2.4-6.1L3.5 11l6.1-2.4z" />
      </svg>
    </span>
  );
}

function Avatar({ email, large = false }: { email: string; large?: boolean }) {
  return (
    <span
      className={`grid place-items-center shrink-0 rounded-full bg-gradient-to-br from-indigo-400 to-fuchsia-500 font-semibold uppercase text-white ring-2 ring-white/10 ${
        large ? "w-11 h-11 text-base" : "w-8 h-8 text-xs"
      }`}
      aria-hidden
    >
      {email[0]}
    </span>
  );
}

// Schlichte Linien-Icons (24×24, stroke) statt Emojis – einheitlicher Look.
type IconName =
  | "collection"
  | "decks"
  | "crown"
  | "discover"
  | "scan"
  | "sparkles"
  | "star"
  | "box"
  | "swap"
  | "hand"
  | "chart"
  | "users"
  | "link"
  | "user"
  | "menu"
  | "grid"
  | "logout"
  | "chevron";

const PATHS: Record<IconName, string> = {
  collection: "M8 3h10a2 2 0 012 2v12M6 7h10a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V9a2 2 0 012-2z",
  decks: "M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2zM9 2h8a2 2 0 012 2",
  crown: "M3 18h18M4 8l4 4 4-7 4 7 4-4-1.5 10h-13z",
  discover: "M12 21a9 9 0 100-18 9 9 0 000 18zM15.5 8.5l-2 5-5 2 2-5z",
  scan: "M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2M8 9h8v6H8z",
  sparkles: "M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z",
  box: "M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8",
  swap: "M7 7h13l-4-4M17 17H4l4 4",
  hand: "M8 13V5.5a1.5 1.5 0 013 0V11m0-1.5v-6a1.5 1.5 0 013 0V11m0-4.5a1.5 1.5 0 013 0V14a7 7 0 01-7 7h-1a6 6 0 01-5-2.7L4 16a1.5 1.5 0 012.5-1.6L8 16",
  chart: "M4 20V4M4 20h16M8 15l4-4 3 3 5-6",
  users: "M16 20v-1a4 4 0 00-4-4H6a4 4 0 00-4 4v1M9 11a4 4 0 100-8 4 4 0 000 8zM22 20v-1a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8",
  link: "M10 14a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.7 1.7M14 10a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7l1.7-1.7",
  user: "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z",
  menu: "M4 6h16M4 12h16M4 18h16",
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  logout: "M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 17l5-5-5-5M15 12H4",
  chevron: "M6 9l6 6 6-6",
};

export function Icon({ name, className = "w-5 h-5" }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
