// Neuigkeiten für das "Neu in der App"-Fenster und die Seite /news.
//
// Pflege: Bei jedem Deploy mit sichtbaren Neuerungen oben einen Eintrag
// ergänzen (neue id = Datum, bei mehreren am Tag "2026-11-18b"). Nur der
// neueste Eintrag erscheint nach dem Update einmal als Fenster; reine
// Fehlerkorrekturen brauchen keinen Eintrag.

export type ReleaseItem = {
  icon: string;
  title: string;
  text: string;
  /** Knopf "Ansehen" führt dorthin */
  href?: string;
};

export type Release = {
  id: string;
  date: string; // ISO
  title: string;
  items: ReleaseItem[];
};

export const RELEASES: Release[] = [
  {
    id: "2026-11-18b",
    date: "2026-11-18",
    title: "Sets im Blick und Scannen in Reihenfolge",
    items: [
      {
        icon: "🗓️",
        title: "Kommende Sets",
        text: "Unter Sets siehst du, welche Sets demnächst erscheinen – mit Datum, Tagen bis zum Release und Vorschau. Deine Sets sind jetzt nach Vollständigkeit sortiert, das vollständigste oben.",
        href: "/sets",
      },
      {
        icon: "📷",
        title: "Scan-Stapel in Reihenfolge",
        text: "Jede gescannte Karte bleibt ein eigener Eintrag, die neueste oben – auch bei gleichem Druck. So prüfst du die Drucke Karte für Karte wie in deinem Stapel.",
        href: "/scan",
      },
    ],
  },
  {
    id: "2026-11-18",
    date: "2026-11-18",
    title: "Verkaufen, neues Logo und mehr Überblick",
    items: [
      {
        icon: "🏷️",
        title: "Extern verkaufen",
        text: "Karten für Cardmarket und Kleinanzeigen vorbereiten: Preisvorschlag nach Druck, Foil und Zustand, fertige Anzeigentexte mit Sammelfoto, „Verkauft“ bucht aus der Sammlung aus.",
        href: "/sell",
      },
      {
        icon: "📈",
        title: "Gewinn und Verlust in Prozent",
        text: "Unter dem Sammlungswert siehst du, wie sich die Preise deiner Karten entwickelt haben – antippen wechselt zwischen gestern, 7 und 30 Tagen.",
        href: "/collection",
      },
      {
        icon: "🃏",
        title: "Deck nach Rollen filtern",
        text: "Im Deck unter „Karten“ eine Rolle wie Ramp oder Removal antippen – die Kartenliste zeigt nur noch diese Karten.",
        href: "/decks",
      },
      {
        icon: "💎",
        title: "Neues Logo",
        text: "Magic Collection hat ein eigenes Logo. Auf dem iPhone die App einmal vom Home-Bildschirm entfernen und neu hinzufügen, damit auch das Symbol wechselt.",
      },
      {
        icon: "💶",
        title: "Zuverlässigere Preise",
        text: "Das nächtliche Preis-Update holt jetzt die Preise aller Drucke – vorher fehlten bei vielen Karten die Tageswerte.",
      },
    ],
  },
];

export const LATEST_RELEASE = RELEASES[0];

/** Ob das Fenster gezeigt werden soll: es gibt Neuigkeiten, die noch nicht gesehen wurden. */
export function shouldShowRelease(seen: string | null | undefined, latest: Release | undefined = LATEST_RELEASE): boolean {
  if (!latest) return false;
  return !seen || seen < latest.id;
}
