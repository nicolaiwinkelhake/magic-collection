# RLS-Sicherheits-Review

Systematischer Durchgang aller Tabellen (Row Level Security) und
`security definer`-Funktionen. Ziel: sicherstellen, dass niemand fremde
Daten lesen oder verändern kann. Stand: nach Migration 003.

## Leitprinzipien

1. **Jede Tabelle hat RLS aktiviert** und Policies, die auf `auth.uid()`
   filtern. Ohne Policy = kein Zugriff (Default-Deny).
2. **`security definer`-Funktionen** laufen mit erhöhten Rechten und müssen
   daher **intern** prüfen, wer aufruft (`auth.uid()`), und dürfen nur
   minimale, klar abgegrenzte Daten zurückgeben.
3. **Schreibende, tabellenübergreifende Logik** (Trades, Preisverlauf) läuft
   ausschließlich über Funktionen – nicht über offene Update-Policies.

## Tabellen-Matrix

| Tabelle | select | insert | update | delete | Bewertung |
|---|---|---|---|---|---|
| cards | eigene | eigene | eigene | eigene | ✅ nur Eigentümer |
| decks | eigene | eigene | eigene | eigene | ✅ |
| deck_cards | eigene | eigene | — | eigene | ✅ (kein Update nötig) |
| friendships | beteiligt | selbst gesendet | beteiligt | beteiligt | ✅ |
| trades | beteiligt | nur proposer | **keine** | — | ✅ Status nur via Funktion |
| trade_items | beteiligt | proposer (pending) | — | — | ✅ |
| wishlist | eigene | eigene | — | eigene | ✅ |
| collection_shares | owner+viewer | nur owner | — | nur owner | ✅ |
| loans | lender+borrower | nur lender | nur lender | nur lender | ✅ |
| card_price_history | alle eingeloggten (lesen) | **keine** | — | — | ✅ Schreiben nur via Funktion; Preise sind öffentlich |
| collection_value_history | eigene | **keine** | — | — | ✅ Schreiben nur via snapshot-Funktion |
| deck_value_history | via Deck-Eigentum | **keine** | — | — | ✅ |

## `security definer`-Funktionen – Prüfung

- **friends_owning_card / friends_wanting_card**: geben nur `friend_id`,
  E-Mail und Menge zurück, **nur** für Personen mit `status = 'accepted'`.
  Keine vollständige Fremdsammlung. ✅
- **find_user_by_email**: gibt nur die `id` zurück. Ermöglicht E-Mail-
  Enumeration (bekannte Einschränkung, für Invite-App vertretbar). ⚠️ dokumentiert
- **my_friendships / my_trades / my_loans**: filtern strikt auf `auth.uid()`. ✅
- **collections_shared_with_me / shared_collection**: `shared_collection`
  gibt Karten nur zurück, wenn eine Freigabe an den Aufrufer existiert
  (`exists(... viewer_id = auth.uid())`). ✅
- **record_card_price**: schreibt nur in den globalen Preisverlauf (öffentliche
  Daten, an Scryfall-ID gebunden). Kein Bezug zu fremden Nutzerdaten. ✅
- **snapshot_collection_value / snapshot_deck_value**: schreiben ausschließlich
  für `auth.uid()` bzw. für Decks im Eigentum des Aufrufers (Prüfung enthalten). ✅
- **accept_trade**: prüft `partner_id = auth.uid()`, Status `pending` und den
  Bestand beider Seiten, bevor transferiert wird. Kann keine Karten „aus dem
  Nichts" erzeugen. Verändert bewusst Sammlungen beider Beteiligter. ✅
  (Verhalten zusätzlich durch Unit-Tests abgesichert, siehe tests/tradeLogic.test.ts)
- **decline_trade**: erlaubt Ablehnen nur dem Partner, Zurückziehen nur dem
  Vorschlagenden. ✅

## Gefundene Punkte / Empfehlungen

1. **E-Mail-Enumeration** über `find_user_by_email` (⚠️): akzeptiert für einen
   geschlossenen Freundeskreis. Falls die App öffentlicher wird, auf
   Einladungscodes umstellen.
2. **`search_path` gesetzt**: Alle Funktionen nutzen `set search_path = public`
   – gut gegen Search-Path-Hijacking. Beibehalten bei neuen Funktionen.
3. **Service-Role-Key**: wird nirgends im Client verwendet (nur der `anon`-Key
   plus RLS). Wichtig: den Service-Role-Key niemals ins Frontend/Repo bringen.
   Ein künftiger Preis-Cron sollte serverseitig (z. B. Supabase Edge Function)
   laufen, nicht im Browser.
4. **Trade-Items-Insert**: Policy erlaubt dem Vorschlagenden, Positionen mit
   `from_user_id = partner` anzulegen (die „Ich bekomme"-Seite). Das ist
   gewollt; die tatsächliche Lieferbarkeit wird erst bei `accept_trade`
   geprüft. ✅ (kein Missbrauch möglich, da Annahme den Partner-Bestand prüft)

## Empfohlene manuelle Gegenprobe (nach Deploy)

Mit zwei Testkonten prüfen:
- Konto B kann Karten/Decks/Wunschliste/Leihen von A **nicht** per direkter
  Abfrage lesen (Supabase-Table-Editor als B / API mit B-Token).
- `shared_collection(A)` liefert für B nur nach aktiver Freigabe Daten.
- Ein Trade, bei dem eine Seite die Karte nicht (mehr) besitzt, lässt sich
  **nicht** annehmen (Fehlermeldung statt Transfer).
