// iPhone/iPad (vor allem als Web-App vom Home-Bildschirm): Nach dem Schließen
// der Tastatur setzt iOS die Höhe des Layout-Bereichs manchmal nicht zurück.
// Folge: Tab-Leiste schwebt mitten im Bild, Kopfzeile verschwindet, unten
// bleibt ein schwarzer Bereich (Karten werden dort nicht gezeichnet).
// Abhilfe: Sobald die Tastatur zu ist, einmal "an Ort und Stelle" scrollen –
// das zwingt iOS, den Bereich neu zu vermessen.

export function installIosViewportFix(): () => void {
  if (typeof window === "undefined") return () => {};
  const ua = navigator.userAgent.toLowerCase();
  const ios = /iphone|ipad|ipod/.test(ua) || (ua.includes("macintosh") && navigator.maxTouchPoints > 1);
  if (!ios) return () => {};

  let timer: ReturnType<typeof setTimeout> | undefined;
  const realign = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const editing = document.activeElement instanceof HTMLElement && document.activeElement.matches("input, textarea, select, [contenteditable]");
      if (editing) return; // Tastatur noch offen
      window.scrollTo(window.scrollX, window.scrollY);
      // Falls die Seite über ihr Ende hinaus verschoben blieb
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      if (window.scrollY > max) window.scrollTo(window.scrollX, max);
    }, 120);
  };

  const vv = window.visualViewport;
  const onVvResize = () => {
    // Tastatur zu = sichtbarer Bereich wieder (fast) so hoch wie das Fenster
    if (!vv || vv.height >= window.innerHeight - 2) realign();
  };
  document.addEventListener("focusout", realign);
  vv?.addEventListener("resize", onVvResize);
  window.addEventListener("orientationchange", realign);
  return () => {
    clearTimeout(timer);
    document.removeEventListener("focusout", realign);
    vv?.removeEventListener("resize", onVvResize);
    window.removeEventListener("orientationchange", realign);
  };
}
