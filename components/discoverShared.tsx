"use client";

// Gemeinsame Bausteine für "Entdecken" und die Deck-Analyse.
import Image from "next/image";
import { formatEur } from "@/lib/format";
import type { FriendCopy, SwapIn } from "@/lib/deckDoctor";

export const cardmarket = (name: string) => `https://www.cardmarket.com/de/Magic/Products/Search?searchString=${encodeURIComponent(name)}`;

export async function getJson<T>(url: string): Promise<{ data: T | null; error: string | null }> {
  const res = await fetch(url).catch(() => null);
  const data = await res?.json().catch(() => null);
  if (!res?.ok || !data) return { data: null, error: data?.error ?? "Konnte nicht geladen werden." };
  return { data, error: null };
}


export function Loading({ text }: { text: string }) {
  return (
    <div className="space-y-2" aria-live="polite">
      <p className="text-sm text-zinc-400">{text}</p>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="h-20 rounded-2xl bg-white/[0.04] animate-pulse" />
      ))}
    </div>
  );
}

export function Hint({ children }: { children: React.ReactNode }) {
  return <p className="surface p-4 text-sm text-zinc-400">{children}</p>;
}

export function ScoreRing({ score, tone }: { score: number; tone: "good" | "ok" | "bad" }) {
  const color = tone === "good" ? "#34d399" : tone === "ok" ? "#fbbf24" : "#f87171";
  return (
    <span
      className="grid place-items-center w-12 h-12 shrink-0 rounded-full text-sm font-bold tabular-nums"
      style={{ background: `conic-gradient(${color} ${score * 3.6}deg, rgba(255,255,255,0.08) 0)` }}
      aria-label={`${score} von 100 Punkten`}
    >
      <span className="grid place-items-center w-9 h-9 rounded-full bg-zinc-900">{score}</span>
    </span>
  );
}

export function Thumb({ src, alt, w = 40 }: { src: string | null | undefined; alt: string; w?: number }) {
  const h = Math.round(w * 1.4);
  return (
    <span className="relative shrink-0 rounded-[5px] overflow-hidden bg-zinc-800" style={{ width: w, height: h }}>
      {src && <Image src={src} alt={alt} width={w} height={h} className="w-full h-full object-cover" />}
    </span>
  );
}

export function SourceBadge({ add, onTrade }: { add: SwapIn; onTrade: (c: FriendCopy) => void }) {
  // Preis + Cardmarket immer zeigen – auch wenn man (oder ein Freund) die Karte hat
  const price = (
    <a href={cardmarket(add.name)} target="_blank" rel="noopener noreferrer" className="rounded-full bg-white/[0.06] text-zinc-300 px-2 py-0.5 text-[11px] whitespace-nowrap">
      {add.eur != null ? `≈ ${formatEur(add.eur)}` : "Cardmarket"} ↗
    </a>
  );
  if (add.source === "collection")
    return (
      <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
        <span className="rounded-full bg-emerald-500/15 text-emerald-300 px-2 py-0.5 text-[11px] font-medium whitespace-nowrap">In deiner Sammlung</span>
        {price}
      </span>
    );
  if (add.source === "friend" && add.friend)
    return (
      <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
        <button onClick={() => onTrade(add.friend!)} className="press rounded-full bg-indigo-500/20 text-indigo-200 px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ring-indigo-400/40 whitespace-nowrap">
          {add.friend.ownerName} hat sie · Trade
        </button>
        {price}
      </span>
    );
  return price;
}

