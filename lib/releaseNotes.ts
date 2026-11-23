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
    id: "2026-11-23",
    date: "2026-11-23",
    title: "Trade aus mehreren Wunschkarten",
    items: [
      {
        icon: "🔁",
        title: "Markieren und Trade anfragen",
        text: "In der Wunschliste „Auswählen“, Karten markieren, „🔁 Trade“ – egal von welchen Freunden. Die App verteilt die Karten auf möglichst wenige Trades, je Freund einen, und sagt dir, welche Karten keiner deiner Freunde mit freigegebener Sammlung hat.",
        href: "/wishlist",
      },
    ],
  },
  {
    id: "2026-11-21",
    date: "2026-11-21",
    title: "In allen Freunde-Sammlungen suchen",
    items: [
      {
        icon: "👥",
        title: "Alle Freunde auf einmal",
        text: "Unter „Geteilt“ gibt es jetzt den Reiter „Alle Freunde“: Du durchsuchst und filterst die Sammlungen aller Freunde zusammen. An jeder Karte steht, wem sie gehört.",
        href: "/shared",
      },
      {
        icon: "🔁",
        title: "Trades teilen sich automatisch auf",
        text: "Wählst du Karten von mehreren Freunden, entsteht für jeden Freund ein eigener Trade. Du schickst sie einzeln ab und gibst jeweils an, was du dafür gibst.",
        href: "/shared",
      },
    ],
  },
  {
    id: "2026-11-20c",
    date: "2026-11-20",
    title: "Trade direkt aus der Wunschliste",
    items: [
      {
        icon: "🔁",
        title: "Trade vorschlagen",
        text: "Filtere die Wunschliste mit „Hat ein Freund“, wähle einen Freund und tippe auf „Trade mit …“. Die Karten, die er hat, landen direkt im Trade-Dialog – du suchst nur noch aus, was du dafür gibst. Auch in der Kartenansicht gibt es den Knopf. Das klappt bei Freunden, die ihre Sammlung für dich freigegeben haben.",
        href: "/wishlist",
      },
    ],
  },
  {
    id: "2026-11-20b",
    date: "2026-11-20",
    title: "Wunschliste: Hat ein Freund?",
    items: [
      {
        icon: "👥",
        title: "Filter „Hat ein Freund“",
        text: "In der Wunschliste zeigst du mit einem Tipp nur die Karten, die mindestens ein Freund besitzt. Mit mehreren Freunden wählst du zusätzlich einen bestimmten aus. Zusammen mit „Auswählen“ lässt sich daraus schnell ein Tausch vorbereiten.",
        href: "/wishlist",
      },
    ],
  },
  {
    id: "2026-11-20",
    date: "2026-11-20",
    title: "Commander-Seite wie bei EDHREC",
    items: [
      {
        icon: "📊",
        title: "Statistik zum Commander",
        text: "Tippst du einen Commander an, siehst du jetzt wie bei EDHREC Platz, Anzahl Decks, Mana-Kurve, Kartentypen, Brackets und Preisklassen.",
        href: "/commanders",
      },
      {
        icon: "🃏",
        title: "Empfohlene Karten mit Anteil und Synergie",
        text: "Neue Karten, Hohe Synergie, Top-Karten, Kreaturen, Spontanzauber, Länder und mehr – mit „% der Decks“ und Synergie. Dazu weiter, was du schon hast oder in welchem Deck die Karte steckt.",
        href: "/commanders",
      },
      {
        icon: "🎯",
        title: "Themen und Budget",
        text: "Wähle ein Thema (z. B. Infect) oder nur Budget- bzw. teure Decks – die Listen passen sich an. Ähnliche Commander sind direkt verlinkt.",
        href: "/commanders",
      },
    ],
  },
  {
    id: "2026-11-19d",
    date: "2026-11-19",
    title: "Commander-Rangliste",
    items: [
      {
        icon: "👑",
        title: "Beliebteste Commander",
        text: "Unter Commander siehst du die Top 100 der letzten 2 Jahre von EDHREC – mit Platz, Bild und Anzahl Decks. Deine eigenen sind markiert, nach Farben filterbar.",
        href: "/commanders",
      },
      {
        icon: "🏅",
        title: "Deine Commander im Vergleich",
        text: "Unter „Deine“ stehen alle Commander aus Sammlung und Decks, sortiert nach Beliebtheit – mit ihrem Platz in der Rangliste.",
        href: "/commanders",
      },
    ],
  },
  {
    id: "2026-11-19c",
    date: "2026-11-19",
    title: "Eigene Kartendatenbank",
    items: [
      {
        icon: "📚",
        title: "Alle Magic-Karten an Bord",
        text: "Die App kennt jetzt alle 111.000 Drucke selbst – Importieren, Hinzufügen und Scannen gehen schneller, deutsche Kartennamen werden direkt erkannt.",
      },
      {
        icon: "🧩",
        title: "Was dir im Set fehlt",
        text: "Unter Sets ein Set aufklappen und „Fehlen dir noch“ antippen: alle fehlenden Karten mit Sammlernummer – mit einem Tipp auf die Wunschliste.",
        href: "/sets",
      },
      {
        icon: "💶",
        title: "Tagespreise für die Wunschliste",
        text: "Wunschliste und Deck-Karten bekommen jetzt jeden Tag aktuelle Preise, nicht nur deine Sammlung.",
        href: "/wishlist",
      },
    ],
  },
  {
    id: "2026-11-19b",
    date: "2026-11-19",
    title: "Besserer Scanner, flexiblere Trades",
    items: [
      {
        icon: "📷",
        title: "Scanner: dunkle Karten und wenig Licht",
        text: "Schwarze Karten und Karten bei schwachem Licht werden deutlich öfter erkannt. Bei wenig Licht prüft der Scanner jede Karte doppelt (weniger Fehltreffer) und bietet die Taschenlampe an.",
        href: "/scan",
      },
      {
        icon: "🎯",
        title: "Scanner: richtige Version",
        text: "Für die Version nutzt der Scanner jetzt alles, was er lesen kann – auch nur das Set-Kürzel oder nur die Nummer – und vergleicht erst dann das Bild.",
        href: "/scan",
      },
      {
        icon: "🔋",
        title: "Scanner: sparsamer",
        text: "Die Automatik schaut nur noch schnell ins Kamerabild, wenn eine neue Karte daliegt – das schont den Akku.",
      },
      {
        icon: "✂️",
        title: "Einzelne Karten entfernen",
        text: "In einem offenen Trade, den du vorgeschlagen hast, nimmst du mit ✕ einzelne Karten wieder heraus.",
        href: "/trades",
      },
      {
        icon: "☑️",
        title: "Nur einen Teil annehmen",
        text: "Bekommst du einen Trade, kannst du einzelne Karten abwählen und nur den Rest annehmen – getauscht werden nur die angehakten.",
        href: "/trades",
      },
      {
        icon: "✅",
        title: "„Hast du schon“ bei Trades",
        text: "Karten, die du bekommst und schon besitzt, sind mit ✓ markiert; im Detail siehst du auch deine Decks.",
        href: "/trades",
      },
    ],
  },
  {
    id: "2026-11-19",
    date: "2026-11-19",
    title: "Besser tauschen mit Freunden",
    items: [
      {
        icon: "✅",
        title: "Was du schon hast",
        text: "In der geteilten Sammlung eines Freundes zeigt ein grünes Häkchen, welche Karten du selbst hast (jede Version), ein lila Abzeichen, in welchen deiner Decks sie stecken. Mit „Nur fehlende“ blendest du alles andere aus.",
        href: "/shared",
      },
      {
        icon: "🔁",
        title: "Angefangene Trades bleiben",
        text: "Karten, die du für einen Trade anfragst, gehen beim Seitenwechsel nicht mehr verloren. Unter Trades stehen sie oben als „Noch nicht abgeschickt“.",
        href: "/trades",
      },
      {
        icon: "🔍",
        title: "Trade-Karten im Detail",
        text: "Karten in einem Trade antippen zeigt sie groß mit Set und Nummer – so suchst du den richtigen Druck leichter heraus.",
        href: "/trades",
      },
      {
        icon: "📁",
        title: "Ordner mit Bestätigung",
        text: "Beim Zuordnen zu einem Ordner siehst du, wie viele Karten übernommen wurden, und das Fenster bleibt für weitere Ordner offen.",
      },
    ],
  },
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
