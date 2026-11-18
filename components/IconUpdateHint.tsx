"use client";

import { useEffect, useState } from "react";
import { ICON_VERSION, iconUrl } from "@/lib/brandVersion";

const KEY = `icon-hint-${ICON_VERSION}`;

/**
 * Ob der Hinweis "neues App-Symbol" gezeigt werden soll – rein, testbar.
 * Nur auf dem iPhone/iPad in der installierten App (iOS tauscht das Symbol
 * auf dem Home-Bildschirm nicht selbst aus; Android tut das automatisch).
 * Eine frisch hinzugefügte App hat noch gar nichts gespeichert – die hat das
 * neue Symbol schon und bekommt keinen Hinweis.
 */
export function shouldShowIconHint(o: { standalone: boolean; ios: boolean; storedKeys: number; done: boolean; later: boolean }) {
  if (!o.standalone || !o.ios || o.done || o.later) return false;
  return o.storedKeys > 0;
}

export function IconUpdateHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
      const ua = window.navigator.userAgent.toLowerCase();
      const ios = /iphone|ipad|ipod/.test(ua) || (ua.includes("macintosh") && navigator.maxTouchPoints > 1);
      const done = localStorage.getItem(KEY) === "done";
      const later = sessionStorage.getItem(KEY) === "later";
      const storedKeys = localStorage.length;
      if (shouldShowIconHint({ standalone, ios, storedKeys, done, later })) setShow(true);
      else if (standalone && ios && storedKeys === 0) localStorage.setItem(KEY, "done");
    } catch {
      // Speicher gesperrt (privater Modus) – dann eben kein Hinweis.
    }
  }, []);

  if (!show) return null;

  const close = (permanent: boolean) => {
    try {
      if (permanent) localStorage.setItem(KEY, "done");
      else sessionStorage.setItem(KEY, "later");
    } catch {}
    setShow(false);
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-end sm:place-items-center bg-black/60 backdrop-blur-sm px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]" role="dialog" aria-modal="true" aria-labelledby="icon-hint-title">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-zinc-900 p-5 shadow-2xl animate-fade-up">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={iconUrl("/icon-192.png")} alt="" className="h-16 w-16 rounded-[22%] shadow-lg shadow-black/50" />
          <div>
            <p id="icon-hint-title" className="font-semibold">Neues App-Symbol</p>
            <p className="text-sm text-zinc-400 mt-0.5">Magic Collection hat ein neues Logo.</p>
          </div>
        </div>
        <p className="mt-4 text-sm text-zinc-300">
          Das iPhone tauscht das Symbol auf dem Home-Bildschirm nicht von selbst aus. So bekommst du das neue:
        </p>
        <ol className="mt-2 space-y-1.5 text-sm text-zinc-300 list-decimal pl-5">
          <li>App-Symbol gedrückt halten → <b>„App entfernen“</b> → <b>„Vom Home-Bildschirm entfernen“</b>.</li>
          <li>In Safari <b>{typeof window !== "undefined" ? window.location.host : "die App-Adresse"}</b> öffnen → <b>Teilen</b> → <b>„Zum Home-Bildschirm“</b>.</li>
          <li>Falls nötig neu anmelden – Sammlung und Decks bleiben erhalten.</li>
        </ol>
        <div className="mt-5 flex gap-2">
          <button onClick={() => close(true)} className="btn-primary h-11 flex-1">Erledigt</button>
          <button onClick={() => close(false)} className="h-11 px-4 rounded-xl text-sm text-zinc-300 bg-white/5 hover:bg-white/10">Später</button>
        </div>
      </div>
    </div>
  );
}
