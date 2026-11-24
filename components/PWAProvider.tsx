"use client";
import { BrandEmblem } from "@/components/ui/Brand";
import { installIosViewportFix } from "@/lib/iosViewportFix";
import { refreshPush } from "@/lib/pushClient";
import { chime, type Chime } from "@/lib/sounds";
import { haptic } from "@/lib/haptics";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PWAProvider() {
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  // iOS: Bildschirmhöhe nach dem Schließen der Tastatur zurücksetzen
  useEffect(() => installIosViewportFix(), []);

  // Push: Abo dem angemeldeten Nutzer zuordnen; kommt eine Mitteilung, während
  // die App offen ist, eigener Ton + Vibration je Art.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void refreshPush();
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type !== "push") return;
      const kind = (["trades", "friends", "shares", "loans"].includes(e.data.kind) ? e.data.kind : "success") as Chime;
      chime(kind);
      haptic("success");
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    // Service Worker registrieren
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    // Bereits installiert (Standalone)? Dann kein Banner.
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS
      (window.navigator as any).standalone === true;

    const wasDismissed =
      localStorage.getItem("pwa-banner-dismissed") === "1";

    if (isStandalone || wasDismissed) {
      setDismissed(true);
      return;
    }
    setDismissed(false);

    // Android/Chrome: natives Installations-Event abfangen
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // iOS Safari hat kein beforeinstallprompt -> Anleitung zeigen
    const ua = window.navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(ua);
    const isSafari = /safari/.test(ua) && !/crios|fxios/.test(ua);
    if (isIos && isSafari) setShowIosHint(true);

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function dismiss() {
    localStorage.setItem("pwa-banner-dismissed", "1");
    setDismissed(true);
  }

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
    dismiss();
  }

  if (dismissed) return null;
  if (!installEvent && !showIosHint) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        zIndex: 40,
        maxWidth: 420,
        margin: "0 auto",
      }}
      // Auf Handy/Tablet über der Tab-Leiste, sonst unten am Rand.
      className="bottom-3 max-lg:[.has-tabbar_&]:bottom-[calc(5.75rem+env(safe-area-inset-bottom))] bg-zinc-900 border border-white/10 rounded-2xl p-4 shadow-lg"
    >
      <div className="flex items-start gap-3">
        <BrandEmblem className="h-9 w-auto shrink-0" />
        <div className="flex-1">
          <p className="font-medium text-sm">App installieren</p>
          {installEvent ? (
            <p className="text-xs text-zinc-400 mt-0.5">
              Lege Magic Collection als App auf deinen Startbildschirm.
            </p>
          ) : (
            <p className="text-xs text-zinc-400 mt-0.5">
              In Safari: auf „Teilen“ tippen, dann „Zum Home-Bildschirm“.
            </p>
          )}
          <div className="flex gap-3 mt-2">
            {installEvent && (
              <button
                onClick={install}
                className="btn-primary h-9 px-3"
              >
                Installieren
              </button>
            )}
            <button
              onClick={dismiss}
              className="text-zinc-400 hover:underline text-sm"
            >
              Nicht jetzt
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
