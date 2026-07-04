# Architektur-Review

Stand: Version 9. Systematischer Blick auf Struktur, Datenflüsse und
Schwachstellen – mit den daraus umgesetzten Verbesserungen.

## Schichten

```
app/…/page.tsx      Server Components: Auth-Check, Daten laden, an Client geben
app/api/…           API-Routen: dünn, delegieren an lib/ (Logik) + Supabase
components/         Client Components: UI + lokaler State, keine Geschäftslogik
lib/                Reine Logik (getestet) + Anbindungen (Scryfall, Supabase)
supabase/           Schema, Migrationen, RLS (Sicherheitsgrenze!), Review-Doku
tests/              Vitest-Unit-Tests der reinen Logik
```

Leitprinzip: **Sicherheit liegt in der Datenbank (RLS), nicht im Frontend.**
Die API-Routen prüfen Auth, aber selbst eine fehlerhafte Route könnte keine
fremden Daten liefern, weil RLS auf `auth.uid()` filtert. Kritische
Mehrschritt-Operationen (Trade-Annahme) laufen als SQL-Funktionen atomar in
der DB.

Zweites Prinzip: **Logik raus aus den Komponenten.** Alles, was rechenbar ist
(Parser, Analyse, Bracket, Kategorien, Playtest, Bewertung, Combos), liegt als
reine Funktion in `lib/` und ist durch Tests abgedeckt. Komponenten rendern
und halten State – mehr nicht.

## Befunde des Reviews (und was daraus wurde)

| # | Befund | Bewertung | Maßnahme |
|---|---|---|---|
| 1 | Wertberechnung existierte 3× (CollectionClient, Cron, Deck) mit leicht abweichenden Regeln (Foil-Fallback ja/nein) | Fehlerquelle | ✅ Zentralisiert in `lib/valuation.ts`, inkl. Zustandsfaktor, getestet |
| 2 | Zustand (NM–DMG) wurde erfasst, floss aber nicht in den Wert ein | Inkonsequent | ✅ `cardValue` bewertet zustandsbereinigt (NM 100 % … DMG 40 %); Sammlung + Cron nutzen sie |
| 3 | Auth-Boilerplate (~8 Zeilen) in jeder API-Route wiederholt | Duplikation | ✅ `lib/apiAuth.ts` (`requireUser`/`unauthorized`), in der Karten-Route angewendet; Muster für alle künftigen Routen |
| 4 | Bracket-Rechner: Zwei-Karten-Combos gar nicht erkannt (dokumentierte Lücke) | Feature-Lücke | ✅ Kuratierte Combo-Liste (`lib/combos.ts`, 20 berüchtigte Paare), hebt auf mind. Bracket 3, getestet |
| 5 | Jede Änderung wartete auf den Server-Roundtrip | Träge UX | ✅ Optimistische Updates im CardGrid (sofort anzeigen, bei Fehler zurückrollen) |
| 6 | Keine Bulk-Operationen | UX-Lücke | ✅ Mehrfachauswahl + Bulk-Löschen (UI + `DELETE /api/cards` mit `ids[]`) |
| 7 | Doppelseitige Karten: Bild-Auflösung | Geprüft | ✅ Bereits korrekt (`card_faces`-Fallback in `getImageUrl`) – kein Handlungsbedarf |
| 8 | Barrierefreiheit lückenhaft | Qualität | ✅ Erste Runde: `aria-label`/`aria-pressed`/`aria-live`, Dialog-Rollen, Fokus-Ringe im CardGrid |

## Bewusste Architektur-Entscheidungen (unverändert gültig)

- **Nur Scryfall** als Kartendatenquelle (Preise EUR/Cardmarket inklusive);
  EDHREC bewusst außen vor bis Datennutzung geklärt.
- **Kein Service-Role-Key im Client** – nur im Cron (Serverumgebung, Bearer-geschützt).
- **Keine ORM-Schicht**: Supabase-Client + RLS reicht für diese Größe; Typen
  in `lib/types.ts` (Empfehlung s. u.).
- **Kein globaler State-Manager**: Server Components laden, `router.refresh()`
  synchronisiert – für diese App-Größe angemessen.

## Offene Empfehlungen (bewusst nicht jetzt)

1. **DB-Typen generieren** (`supabase gen types typescript`) statt Handpflege
   in `lib/types.ts` – lohnt ab dem ersten echten Deployment.
2. **E2E-Tests (Playwright)** für die Kernabläufe (Login → Import → Trade) –
   sinnvoll erst gegen eine laufende Instanz.
3. **Rate-Limiting** der Import-/Preis-Routen (z. B. Upstash) – relevant, falls
   die App über den Freundeskreis hinauswächst.
4. **Error-Boundary + einheitlicher API-Client** im Frontend – das
   Rollback-Muster aus dem CardGrid taugt als Vorlage für die übrigen Clients.
5. **`requireUser` flächendeckend** in den Bestandsrouten nachziehen (rein
   mechanische Umstellung, bei nächster Gelegenheit).
