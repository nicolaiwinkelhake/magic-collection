# Magic Collection

Eine private Plattform für dich und deine Freunde, um eure Magic: The
Gathering Sammlungen zu importieren, zu durchsuchen und zu filtern.
Bilder werden live von [Scryfall](https://scryfall.com) geladen.

## Tech-Stack

- **Next.js 14** (App Router) – Frontend & API-Routen
- **Supabase** – Auth (E-Mail/Passwort) + Postgres-Datenbank
- **Scryfall API** – Kartendaten & Bilder (kostenlos, kein Key nötig)
- **Tailwind CSS** – Styling

## Funktionen

- **Sammlung**: Karten importieren (Scryfall-Abgleich), filtern nach Name, Farbe, Typ, Seltenheit
- **Commander Decks**: eigene Decks anlegen, Commander setzen, Kartenliste importieren
- **Automatische Deck-Analyse**: erkennt Anzahl Länder, Ramp, Removal, Kartenziehen,
  Board Wipes, Mana-Kurve und Verstöße gegen die Farbidentität des Commanders –
  und gibt konkrete Verbesserungsvorschläge aus
- **Freunde**: Freundschaftsanfragen per E-Mail, erst nach gegenseitiger
  Bestätigung sichtbar
- **"Freund besitzt diese Karte"**: In jeder Deckliste wird angezeigt, welcher
  Freund eine Karte bereits besitzt (z. B. um sie sich zu leihen) – ohne dass
  ihr je die komplette Sammlung des anderen einsehen könnt
- **Cardmarket-Preise in €**: Werden automatisch über Scryfall mitgeliefert
  (Scryfall bezieht seine EUR-Preise direkt von Cardmarket) – keine eigene
  Cardmarket-Anbindung nötig. Gesamtwert von Sammlung und Decks wird live
  berechnet, ein Button aktualisiert die Preise auf den aktuellen Stand
- **Trades mit Historie**: Karten mit bestätigten Freunden handeln. Beim Annehmen
  wandern die Karten automatisch und geprüft zwischen den Sammlungen. Jeder Trade
  bleibt mit Werten und Status als Verlauf sichtbar
- **Wertverlauf**: Gesamtwert der Sammlung und Preis einzelner Karten über die
  Zeit als Diagramm – die Daten entstehen bei jedem Preis-Update
- **CSV-Import & -Export**: Sammlung per CSV aus Moxfield/Archidekt/Deckbox
  importieren und als CSV exportieren
- **Wunschliste**: gesuchte Karten sammeln; es wird angezeigt, welcher Freund
  eine Wunschkarte besitzt
- **Deck-Baubarkeit**: pro Deck sehen, welche Karten du aus deiner Sammlung
  schon hast und welche (zu welchem Preis) dir noch fehlen
- **Mana-Kurve & Farbverteilung**: grafische Deckauswertung zusätzlich zur
  Textanalyse, plus Deckwert-Verlauf
- **Sammlungs-Freigabe**: einzelnen Freunden read-only Zugriff auf die eigene
  Sammlung geben
- **Leih-Tracking**: festhalten, wem du welche Karte geliehen hast
- **Trade-Balance**: bei jedem Trade wird die Wertdifferenz beider Seiten angezeigt
- **Foto-Import (OCR)**: Karte fotografieren → der Name wird im Browser per
  Tesseract.js ausgelesen, gegen Scryfall abgeglichen und nach deiner Bestätigung
  importiert (`/scan`). Läuft ohne Kosten auf dem Gerät; funktioniert am besten
  bei gutem Licht und gerader Aufnahme.
- **Kartenvorschläge**: pro Deck schlägt die App passende Karten aus Scryfall vor
  – gefiltert nach Farbidentität des Commanders und den schwächsten Kategorien
  (Removal/Ramp/Draw/Board Wipe). Basiert vollständig auf Scryfall-Daten.

- **Kartenverwaltung ohne Import**: In der Sammlung eine Karte antippen, um
  Menge zu ändern, Foil umzustellen oder sie zu entfernen.
- **Deck bearbeiten**: Deck umbenennen, Commander tauschen, einzelne Karten
  entfernen und ganze Decks löschen.
- **Account-Verwaltung** (`/account`): Passwort ändern, E-Mail-Adresse ändern
  (mit Bestätigungslink), abmelden.
- **Power-Level / Commander-Bracket**: pro Deck eine Einstufung ins offizielle
  5-Stufen-System (Beta) – regelbasiert auf der Game-Changers-Liste von Scryfall
  (`is:gamechanger`), inkl. Begründung und erkannten Game Changern. Zwei-Karten-
  Combos werden bewusst noch nicht automatisch erkannt.
- **Kartendetails**: Zustand (NM–DMG) und Sprache pro Karte, im Karten-Editor
  einstellbar und im CSV-Export enthalten.
- **Set-Fortschritt** (`/sets`): pro Set, wie viele verschiedene Karten du besitzt,
  mit Fortschrittsbalken (Gesamtzahl je Set von Scryfall).
- **Deck-Kategorien**: Deckkarten werden automatisch nach Rolle gruppiert
  (Länder, Ramp, Removal, Board Wipe, Kartenziehen, Kreaturen, Sonstiges).
- **Set-Filter & Sortierung** in der Sammlung (Name, Manawert, Preis, Set).
- **Playtester / Goldfishing**: pro Deck eine Testhand ziehen, Mulligan (London)
  und nachziehen – mit Länder-Zähler und Mulligan-Hinweisen. Reine Frontend-
  Simulation zum Prüfen der Manakurve (Commander bleibt in der Command Zone).
- **Zustandsbereinigte Bewertung**: der Sammlungswert berücksichtigt den
  Kartenzustand (NM 100 %, LP 90 %, MP 75 %, HP 60 %, DMG 40 %) – zentral in
  `lib/valuation.ts`, überall dieselbe Rechnung (Anzeige + Cron-Snapshots).
- **Zwei-Karten-Combos im Bracket**: kuratierte Liste bekannter Combos
  (Thassa's Oracle + Demonic Consultation u. v. m.) hebt Decks auf mindestens
  Bracket 3 und wird in der Begründung ausgewiesen.
- **Bulk-Aktionen**: in der Sammlung „Auswählen" antippen, mehrere Karten
  markieren und gemeinsam löschen.
- **Optimistische Oberfläche**: Änderungen an Karten (Menge, Foil, Zustand,
  Sprache, Löschen) erscheinen sofort; bei Serverfehlern wird zurückgerollt.
- **Kartenvorschau**: im Karten-Editor das Bild antippen für eine Großansicht.
- **Nächtlicher Preis-Cron**: aktualisiert Preise für alle Nutzer und schreibt
  tägliche Wert-Snapshots (Sammlung & Decks) – so wird der Verlauf tagesgenau.

## Nächtlicher Preis-Cron

`vercel.json` richtet einen täglichen Cron ein, der `/api/cron/prices` aufruft.
Voraussetzungen (in Vercel als Environment-Variablen setzen):

- `SUPABASE_SERVICE_ROLE_KEY` – der service_role-Key aus Supabase (umgeht RLS;
  **niemals** ins Frontend/Repo committen).
- `CRON_SECRET` – ein frei gewähltes Geheimnis. Vercel sendet es automatisch als
  `Authorization: Bearer <CRON_SECRET>` an den Cron-Endpunkt.

Der Job aktualisiert Kartenpreise für alle Nutzer über den Scryfall-Batch-
Endpoint und schreibt die Tages-Snapshots für Sammlungs- und Deckwerte.

## Tests

Unit-Tests für die Kernlogik (Decklisten-Parser, CSV-Import, Deck-Analyse,
Vorschlags-Queries, **Trade-Übertragung**) mit Vitest:

```bash
npm test
```

Die Tests laufen ohne Netzwerk. Die Trade-Tests (`tests/tradeLogic.test.ts`)
sichern die kritischste Stelle ab – das Verschieben echter Karten zwischen
zwei Sammlungen inkl. Bestandsprüfung, Teiltausch, Foil-Trennung und
Fehlerfällen. Die reine Logik spiegelt die SQL-Funktion `accept_trade`.

## Continuous Integration

`.github/workflows/ci.yml` lässt bei jedem Push/PR auf `main` automatisch
Typecheck, Tests und Build laufen – so kommt kein kaputter Stand ins Repo.

## Sicherheit

Ein systematischer Durchgang aller RLS-Policies und `security definer`-
Funktionen steht in `supabase/SECURITY_REVIEW.md` (inkl. empfohlener
manueller Gegenprobe mit zwei Testkonten nach dem Deploy).

## Sicherheit

- Jeder Nutzer hat einen eigenen Account (E-Mail + Passwort, von Supabase
  sicher gehasht/verwaltet).
- **Row Level Security** in der Datenbank stellt sicher, dass jeder
  Nutzer ausschließlich seine eigenen Karten/Decks sehen/bearbeiten kann –
  selbst bei einem Bug im Frontend käme niemand an fremde Daten.
- Die "Freund besitzt diese Karte"-Funktion läuft über eine eng begrenzte
  Datenbankfunktion (`friends_owning_card`), die ausschließlich Besitzer-ID,
  E-Mail und Stückzahl zurückgibt – und das nur für Personen, mit denen eine
  **bestätigte** Freundschaft besteht. Es gibt keinen Weg, fremde Sammlungen
  vollständig auszulesen.
- Eine Middleware schützt alle Seiten außer Login/Signup vor Zugriff
  ohne gültige Session.

## Setup

### 1. Supabase-Projekt anlegen

1. Auf [supabase.com](https://supabase.com) kostenlos registrieren und
   ein neues Projekt erstellen.
2. Unter **SQL Editor** das Schema einspielen:
   - **Frische Datenbank**: kompletten Inhalt von `supabase/schema.sql` ausführen.
   - **Bestehende Datenbank** (Schema v1 bereits ausgeführt): nur
     `supabase/migrations/002_trades_history.sql` ausführen. Diese Migration
     bereinigt doppelte Karten, fügt Trades, Preisverlauf und Wertverlauf hinzu.

   Ab jetzt werden Schemaänderungen als nummerierte Dateien unter
   `supabase/migrations/` gepflegt – einfach die jeweils neue Datei ausführen.
   Aktuell: `002_trades_history.sql` (Trades/Wertverlauf) und
   `003_wishlist_sharing_loans.sql` (Wunschliste, Freigabe, Leihen, Deckwert-Verlauf).
3. Unter **Project Settings → API** die `Project URL` und den
   `anon public key` kopieren.
4. Optional, aber empfohlen: Unter **Authentication → Settings**
   "Confirm email" aktiviert lassen, damit nur echte E-Mail-Adressen
   sich registrieren können.

### 2. Lokales Setup

```bash
npm install
cp .env.local.example .env.local
# .env.local mit den Werten aus Schritt 1 befüllen
npm run dev
```

Die App läuft dann auf `http://localhost:3000`.

### 3. Deployment (empfohlen: Vercel)

1. Repo auf [vercel.com](https://vercel.com) importieren.
2. Die zwei Umgebungsvariablen aus `.env.local` dort in den
   Project Settings eintragen.
3. Deployen – fertig. Vercel hat einen kostenlosen Plan, der für einen
   Freundeskreis locker reicht.

## Code auf GitHub pushen

Im Projektordner ausführen:

```bash
git init
git add .
git commit -m "Initial commit: Magic Collection App"
git branch -M main
git remote add origin https://github.com/DEIN-USERNAME/DEIN-REPO.git
git push -u origin main
```

Falls das Repo auf GitHub noch nicht existiert: vorher auf
github.com ein neues, leeres (privates!) Repository anlegen, dann die
obigen Befehle ausführen. **Privat** ist hier wichtig, da es um eure
private Sammlung geht.

## Karten importieren

Auf der Sammlung-Seite oben auf "Karten importieren" klicken und eine
Liste von Kartennamen einfügen (eine pro Zeile). Auch
Deckliste-Notation wie `2x Lightning Bolt` wird erkannt.

## Nächste mögliche Ausbaustufen

- CSV-Import (z. B. direkter Export aus Moxfield/Archidekt)
- Sortierung nach Mana-Wert / Set
- Sammlung anderer Freunde einsehen (read-only Freigabe)
- Gesamtwert der Sammlung (Scryfall liefert auch Preisdaten)

## Als App installieren (PWA)

Die App ist eine Progressive Web App – sie lässt sich ohne App Store direkt
auf dem Handy installieren:

- **Android (Chrome)**: Seite öffnen → es erscheint unten ein Banner
  „App installieren“ (oder Menü ⋮ → „App installieren“). Danach liegt ein
  Icon auf dem Startbildschirm und die App startet im Vollbild.
- **iPhone (Safari)**: Seite öffnen → „Teilen“-Symbol → „Zum Home-Bildschirm“.

Voraussetzung ist HTTPS – bei Vercel automatisch gegeben. Icon, Name, Farben
und der Offline-Hinweis sind bereits konfiguriert (`app/manifest.ts`,
`public/sw.js`, `public/offline.html`).

## Hinweis zu Preis-Updates bei großen Sammlungen

Der "Preise aktualisieren"-Button fragt jede Karte einzeln bei Scryfall ab.
Bei kostenlosem Vercel-Hosting sind API-Routen auf ca. 10 Sekunden begrenzt –
das reicht für ein paar hundert Karten. Bei sehr großen Sammlungen (500+)
kann es sinnvoll sein, stattdessen Scryfalls täglichen Bulk-Data-Export zu
nutzen oder das Update in Batches aufzuteilen. Sag Bescheid, falls das bei
euch relevant wird, dann bauen wir das um.
