"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { neighborIndex, swipeStep } from "@/lib/swipe";

// Gemeinsame Hülle für Kartendetails, durch die man blättern kann:
// Handy = Blatt von unten, Desktop = Fenster mit Pfeilen daneben.
// Wischen links/rechts, Pfeil-Knöpfe, Pfeiltasten, Escape, Anzeige "x / n".
// Inhalt kommt als children und wird pro Karte neu eingeschoben.

export function SwipeSheet({
  index,
  count,
  onIndexChange,
  onClose,
  title,
  subtitle,
  label,
  closeDisabled = false,
  keyboardDisabled = false,
  children,
}: {
  index: number;
  count: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  label: string;
  /** z. B. während gespeichert wird */
  closeDisabled?: boolean;
  /** z. B. solange eine Vollbild-Vorschau darüber liegt */
  keyboardDisabled?: boolean;
  children: ReactNode;
}) {
  const [slideDir, setSlideDir] = useState<-1 | 0 | 1>(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  // Mitziehen beim Wischen direkt am DOM (ohne React-Neurender je Bewegung),
  // gebündelt pro Bildschirm-Frame – das hält das Wischen flüssig.
  const slideRef = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const dragging = useRef(false);
  function setDrag(x: number) {
    if (frame.current != null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const el = slideRef.current;
      if (!el) return;
      el.style.transition = x ? "none" : "transform 200ms cubic-bezier(.2,.8,.2,1)";
      el.style.transform = x ? `translate3d(${x}px,0,0)` : "";
    });
  }

  const prev = neighborIndex(index, -1, count);
  const next = neighborIndex(index, 1, count);

  function step(dir: -1 | 1) {
    const i = neighborIndex(index, dir, count);
    if (i == null) return;
    setSlideDir(dir);
    onIndexChange(i);
  }

  // Tastatur: Pfeile blättern, Escape schließt.
  useEffect(() => {
    if (keyboardDisabled) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "SELECT" || t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "Escape" && !closeDisabled) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Beim Blättern wieder oben anfangen.
  useEffect(() => {
    sheetRef.current?.scrollTo({ top: 0 });
  }, [index]);

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  }
  function onTouchMove(e: React.TouchEvent) {
    if (!touchStart.current) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    // Nur waagerechtes Ziehen mitführen, senkrecht bleibt Scrollen.
    if (Math.abs(dx) > Math.abs(dy) * 1.5) {
      // Am Rand gedämpft ziehen, damit klar ist: hier geht es nicht weiter.
      const blocked = (dx < 0 && next == null) || (dx > 0 && prev == null);
      dragging.current = true;
      setDrag(blocked ? dx / 4 : dx);
    }
  }
  function onTouchEnd(e: React.TouchEvent) {
    const start = touchStart.current;
    touchStart.current = null;
    if (dragging.current) {
      dragging.current = false;
      setDrag(0);
    }
    if (!start) return;
    const t = e.changedTouches[0];
    const dir = swipeStep(t.clientX - start.x, t.clientY - start.y);
    if (dir !== 0) step(dir);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-50 bg-black/75 flex items-end sm:items-center justify-center sm:p-4"
      onClick={() => !closeDisabled && onClose()}
    >
      {/* Blättern-Pfeile neben dem Fenster (Desktop) */}
      {prev != null && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            step(-1);
          }}
          aria-label="Vorherige Karte"
          className="hidden sm:grid absolute left-4 top-1/2 -translate-y-1/2 place-items-center w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-2xl"
        >
          ‹
        </button>
      )}
      {next != null && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            step(1);
          }}
          aria-label="Nächste Karte"
          className="hidden sm:grid absolute right-4 top-1/2 -translate-y-1/2 place-items-center w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-2xl"
        >
          ›
        </button>
      )}
      <div
        ref={sheetRef}
        className="relative bg-zinc-900 border border-white/10 rounded-t-[2rem] sm:rounded-3xl w-full sm:max-w-2xl max-h-[92dvh] overflow-y-auto overflow-x-hidden shadow-2xl pb-[env(safe-area-inset-bottom)] animate-[sheet_280ms_cubic-bezier(.2,.8,.2,1)] sm:animate-none"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => {
          touchStart.current = null;
          dragging.current = false;
          setDrag(0);
        }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-4 pt-4 pb-3 bg-zinc-900 border-b border-white/[0.06]">
          <span className="sm:hidden absolute left-1/2 top-1.5 -translate-x-1/2 h-1.5 w-10 rounded-full bg-white/15" aria-hidden />
          <button
            onClick={() => step(-1)}
            disabled={prev == null}
            aria-label="Vorherige Karte"
            className="sm:hidden shrink-0 grid place-items-center w-9 h-9 rounded-full bg-white/10 text-xl disabled:opacity-30"
          >
            ‹
          </button>
          <div className="min-w-0 flex-1">
            <p className="font-semibold truncate">{title}</p>
            <p className="text-xs text-zinc-500 truncate">
              {index + 1} / {count}
              {subtitle ? <> · {subtitle}</> : null}
            </p>
          </div>
          <button
            onClick={() => step(1)}
            disabled={next == null}
            aria-label="Nächste Karte"
            className="sm:hidden shrink-0 grid place-items-center w-9 h-9 rounded-full bg-white/10 text-xl disabled:opacity-30"
          >
            ›
          </button>
          <button
            onClick={onClose}
            disabled={closeDisabled}
            aria-label="Schließen"
            className="shrink-0 grid place-items-center w-9 h-9 rounded-full bg-white/10 hover:bg-white/15 disabled:opacity-50"
          >
            ✕
          </button>
        </div>
        <div
          key={index}
          ref={slideRef}
          className={`will-change-transform ${
            slideDir === 1
              ? "animate-[swipe-from-right_180ms_ease-out]"
              : slideDir === -1
                ? "animate-[swipe-from-left_180ms_ease-out]"
                : ""
          }`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
