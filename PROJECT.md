# PROJECT.md – Architektur & Projektstand

Dieses Dokument hält Architektur, Entscheidungen und offene Punkte fest,
damit man jederzeit (auch in einer neuen Session) sauber weiterarbeiten kann.

## Zweck

Private Plattform für einen Freundeskreis: Magic-Sammlungen verwalten,
Commander-Decks pflegen und analysieren, Karten untereinander handeln und den
Wertverlauf der Sammlung verfolgen. Kartendaten, Bilder und Cardmarket-Preise
(EUR) kommen von der kostenlosen Scryfall-API.

## Tech-Stack

- **Next.js 14** (App Router), TypeScript
- **Supabase**: Auth (E-Mail/Passwort) + Postgres mit Row Level Security
- **Scryfall API**: Karten, Bilder, EUR-Preise (kein eigener Cardmarket-Zugang)
- **Tailwind CSS**, **recharts** (Charts)
- Hosting-Empfehlung: Vercel (Frontend/API) + Supabase (DB)

## Verzeichnisstruktur (Kurzüberblick)

```
app/
  collection/        Sammlung (Hub mit Navigation)
  scan/              Foto-Import (OCR im Browser)
  decks/             Deckliste + /decks/[id] Detail mit Analyse & Vorschlägen
  wishlist/          Wunschliste
  loans/             Leih-Tracking
  shared/            Von Freunden freigegebene Sammlungen
  friends/           Freundschaftsverwaltung + Freigaben
  trades/            Trade-Vorschlag + Historie
  stats/             Wertverlauf (gesamt + je Karte)
  api/               Import, Export, Decks, Freunde, Trades, Wunschliste,
                     Leihen, Freigaben, Preise, Scryfall-Resolve, Vorschläge
components/          Client-Komponenten (UI + State)
lib/
  scryfall.ts        API-Anbindung inkl. Batch- & Suggestion-Abruf
  scryfallSearch.ts  Query-Builder für Vorschläge (rein, getestet)
  deckAnalysis.ts    Heuristische Deck-Verbesserungen + schwache Kategorien
  parseDeckList.ts   Parser für "2x Name *F*"-Notation (getestet)
  csv.ts             CSV-Import/-Export (getestet)
  format.ts          Zentrale €-/Datums-Formatierung
  supabase/          Server- & Browser-Client
tests/               Vitest-Unit-Tests der Kernlogik
supabase/
  schema.sql         Vollständiges Schema für FRISCHE Installation
  migrations/        001..003 (für bestehende DBs)
```

## Datenmodell

- **cards**: Sammlung pro Nutzer. Eindeutig je `(user_id, scryfall_id, foil)`,
  Mengen über `quantity`. Preisfelder + `price_updated_at`.
- **decks** / **deck_cards**: Commander-Decks und ihre Karten.
- **friendships**: gegenseitige Bestätigung (`pending`/`accepted`).
- **trades** / **trade_items**: Handelsvorschläge + Positionen. `from_user_id`
  je Position bestimmt die Richtung. Preis zum Trade-Zeitpunkt wird festgehalten.
- **card_price_history**: globaler Preisverlauf je `(scryfall_id, captured_on)`.
- **collection_value_history**: Tages-Snapshot des Gesamtwerts je Nutzer.

## Wichtige Designentscheidungen

1. **Sicherheit über RLS**: Jede Tabelle hat Policies, sodass Nutzer nur eigene
   Daten sehen. Sensible, tabellenübergreifende Logik (fremder Kartenbesitz,
   Trade-Annahme, Preisverlauf-Writes) läuft über `security definer`-Funktionen
   mit expliziten Berechtigungsprüfungen statt offener Policies.
2. **Trades verändern echte Bestände**: `accept_trade()` prüft Bestand beider
   Seiten und transferiert Karten atomar. Es können keine Karten „aus dem Nichts“
   entstehen. Statuswechsel laufen ausschließlich über Funktionen (keine
   Update-Policy auf `trades`), damit niemand `accepted` ohne Transfer setzen kann.
3. **Preise aus Scryfall statt Cardmarket-API**: spart OAuth/Händler-Onboarding.
   EUR-Preise sind Cardmarket-Daten, die Scryfall mitliefert.
4. **Batch-Preisupdate** über `/cards/collection` (75 IDs/Request) statt
   Einzelabfragen – schnell genug auch für große Sammlungen.
5. **Wertverlauf** entsteht durch Snapshots beim Import und beim Preis-Update.
   Für echte Tagesgenauigkeit ohne manuelles Klicken → Cron empfohlen (siehe unten).

## Setup / Resume

1. Supabase-Projekt anlegen.
2. **Frische DB**: `supabase/schema.sql` im SQL-Editor ausführen.
   **Bestehende DB (v1)**: nur `supabase/migrations/002_trades_history.sql`
   ausführen (enthält Bestandsbereinigung + neue Objekte).
3. `.env.local` aus `.env.local.example` füllen.
4. `npm install && npm run dev`.

## Features seit Version 3

Wunschliste, CSV-Import/-Export, Deck-Baubarkeit (fehlende Karten aus der
Sammlung), Mana-Kurve/Farbverteilung, Deckwert-Verlauf, read-only
Sammlungs-Freigabe an Freunde, Leih-Tracking und Trade-Balance.

## Features seit Version 9 (Architektur-Review-Runde)

Architektur-Review dokumentiert in `ARCHITECTURE.md` (Befunde-Tabelle).
Umgesetzt: zentrale zustandsbereinigte Bewertung (`lib/valuation.ts`, ersetzt
3 duplizierte Rechnungen; Anzeige + Cron nutzen sie), Zwei-Karten-Combo-
Erkennung im Bracket (`lib/combos.ts`, kuratierte Liste, hebt auf mind. B3),
zentraler Auth-Helfer (`lib/apiAuth.ts`), Bulk-Löschen (`DELETE /api/cards`
mit `ids[]` + Mehrfachauswahl im CardGrid), optimistische Updates mit
Fehler-Rollback im CardGrid, Kartenvorschau (Großansicht), A11y-Runde
(aria-Attribute, Dialog-Rollen, Fokus-Ringe). Tests: valuation (10) und
combos (7) neu – offline verifiziert.

## Features seit Version 8

Playtester/Goldfishing (`lib/playtest.ts`, `components/PlaytestClient.tsx`):
Testhand ziehen, London-Mulligan, Nachziehen, Länder-Zähler. Reine Frontend-
Logik mit seedbarem PRNG, durch Unit-Tests abgesichert (`tests/playtest.test.ts`).

## Features seit Version 7

Kartendetails (Zustand NM–DMG + Sprache, `migrations/004_card_details.sql`),
Set-Fortschritt (`/sets`, `lib/scryfall.ts` fetchSets), Deck-Kategorien
(`lib/deckCategories.ts`, getestet), Set-Filter & Sortierung in der Sammlung,
und der nächtliche Preis-Cron (`app/api/cron/prices`, `vercel.json`,
`lib/supabase/admin.ts`) inkl. Service-Role-Client. Politur: wiederverwendbare
`EmptyState`/`Spinner` in `components/ui/States.tsx`.

## Features seit Version 6

Commander-Bracket-Rechner (`lib/bracket.ts`, `/api/decks/[id]/bracket`):
regelbasierte Power-Level-Einstufung nach dem offiziellen 5-Stufen-System,
gestützt auf die Game-Changers-Liste von Scryfall (`is:gamechanger`). Durch
Unit-Tests abgesichert (`tests/bracket.test.ts`). Bewusste Vereinfachung:
Zwei-Karten-Combos werden noch nicht datenbankgestützt erkannt – möglicher
Ausbau über Commander Spellbook.

## Härtung (Betriebsreife)

- **Trade-Übertragung getestet**: `tests/tradeLogic.test.ts` sichert die
  kritischste Logik ab (Bestandsprüfung, Teiltausch, Foil-Trennung,
  beidseitiger Tausch, keine Seiteneffekte). `lib/tradeLogic.ts` spiegelt die
  Regeln der SQL-Funktion `accept_trade`.
- **RLS-Review**: `supabase/SECURITY_REVIEW.md` dokumentiert alle Policies und
  Funktionen inkl. offener Punkte (E-Mail-Enumeration) und manueller Gegenprobe.
- **CI**: `.github/workflows/ci.yml` (Typecheck, Tests, Build bei Push/PR).

## Features seit Version 5

Kartenverwaltung direkt in der Sammlung (Menge, Foil, Löschen per Editor-
Overlay), Deck-Bearbeitung (Umbenennen, Commander tauschen, Deckkarten
entfernen, Deck löschen) und Account-Verwaltung (Passwort/E-Mail ändern,
abmelden) unter `/account`.

## Features seit Version 4

Foto-Import per Kamera mit Browser-OCR (Tesseract.js) und Scryfall-Abgleich
inkl. Bestätigungsschritt (`/scan`), sowie Scryfall-basierte Kartenvorschläge
pro Deck (nach Farbidentität und schwächsten Kategorien). Dazu Unit-Tests
(Vitest) für die Kernlogik.

## Bewusst (noch) nicht gebaut – eigene Projekte

- **Karten-Erkennung per Bild-KI (Edition-genau)**: Der aktuelle Foto-Import
  liest nur den Namen (OCR). Eine Erkennung der exakten Edition/des Drucks aus
  dem Bild bräuchte ein Vision-Modell oder einen kostenpflichtigen Dienst
  (z. B. Ximilar). Nächster möglicher Ausbau, falls Editions-Genauigkeit nötig wird.
- **EDHREC-Vorschläge**: erfordert Klärung der Datennutzung/API-Zugang von
  EDHREC. Die aktuellen Vorschläge nutzen bewusst nur Scryfall-Daten (inkl.
  edhrec_rank zur Sortierung), was rechtlich unbedenklich ist. Bei grünem Licht
  von EDHREC ließen sich synergiebasierte Vorschläge ergänzen.
- **Echte Push-Benachrichtigungen** (z. B. bei Trade-Anfragen): auf Android via
  Web-Push machbar, auf iOS nur eingeschränkt und mit Zusatzaufwand
  (Service-Worker-Push, VAPID-Keys, Backend-Versand).
- **Preis-Alarme**: Datenmodell/UI wären klein, aber die Zustellung braucht
  denselben nächtlichen Cron-Job wie die Preis-Snapshots.

## Bekannte Grenzen / nächste sinnvolle Schritte

- **Automatischer täglicher Preis-Snapshot**: aktuell wird der Verlauf nur beim
  Import/Preis-Update geschrieben. Sauberer wäre ein Supabase Cron (pg_cron) oder
  ein Vercel Cron Job, der nachts `record_card_price` + `snapshot_collection_value`
  für alle Nutzer aufruft. → dafür einen Service-Role-Job bauen.
- **Snapshot beider Trade-Parteien**: nach `accept_trade` wird nur der eigene
  Wert-Snapshot aktualisiert; der des Partners erst bei dessen nächstem Update.
- **E-Mail-Enumeration**: `find_user_by_email` verrät, ob eine E-Mail existiert.
  Für eine Invite-only-App im Freundeskreis vertretbar; bei Bedarf durch
  Einladungscodes ersetzen.
- **Deck-Karten ohne Mengen**: `deck_cards` führt keine `quantity` (Singleton-
  Format). Für 60-Karten-Formate mit Mehrfachexemplaren müsste das ergänzt werden.
- **CSV-Import** aus Moxfield/Archidekt wäre ein naheliegendes Komfort-Feature.
- **Tests**: bisher keine. Für `accept_trade`/Analyse-Heuristik lohnen sich Unit-Tests.
```
