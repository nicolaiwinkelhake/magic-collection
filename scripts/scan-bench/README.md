# Scanner-Messstand

Misst, wie gut und wie schnell der Scanner Karten erkennt – mit genau dem
Code der App (`lib/scanRecognize.ts`). Aus echten Kartenbildern werden
künstliche Kamerabilder gebaut (Tisch, Schräglage, Unschärfe, Rauschen,
Spiegelung) und durch die Erkennung geschickt.

```bash
python3 scripts/scan-bench/fetch-data.py <daten>   # einmalig, braucht <daten>/own-sets.txt
node scripts/scan-bench/run.mjs <daten>            # alle Bedingungen
node scripts/scan-bench/run.mjs <daten> --limit 60 --only typisch
```

Ausgabe je Bedingung (`ideal`, `typisch`, `schwer`, `fern`):

- **sofort richtig** – Name per Wörterbuch sicher, ohne Netz
- **falsche Karte** – sicher, aber falsch (muss 0 sein)
- **über Set/Nr** – Name unsicher, aber Set + Nummer gelesen und der Name passt dazu
- **nur per Netz** – unscharfe Suche mit dem gelesenen Text
- **nicht erkannt** – in der App: nächstes Kamerabild
- **Druck gelesen** – Set + Nummer richtig (genauer Druck → richtiger Preis)

`exp.mjs` vergleicht einzelne Varianten (Ausschnitt, Höhe, Lesemodus) – damit
wurden die Einstellungen in `lib/scanRead.ts` gewählt.

Stand (262 Karten aus den Sets der Sammlung): typisch 88 % sofort richtig,
94 % erkannt, 0 falsche Karten bei 1048 Scans.
