// Gemeinsames Einlesen für alle Importe (Sammlung, Wunschliste, Deck):
// Textliste ("2x Name", "Name *F*") oder CSV-Datei. CSVs mit Scryfall-ID
// (ManaBox, Moxfield) werden exakt per ID/Set+Nummer zugeordnet, andere CSVs
// (Archidekt, Deckbox, …) über Name/Menge/Foil-Spalten.

import { parseDeckList } from "@/lib/parseDeckList";
import { csvToEntries, moxfieldCsvToEntries } from "@/lib/csv";
import type { SourceEntry } from "@/lib/importJob";

export type ParsedSource = {
  entries: SourceEntry[];
  /** "csv" = mit Scryfall-IDs (exakt), "text" = nur Namen */
  mode: "csv" | "text";
  /** Hinweis, falls nichts erkannt wurde */
  problem?: string;
};

export function textToEntries(text: string): ParsedSource {
  // Eine eingefügte CSV (z. B. aus der Zwischenablage) wie eine Datei behandeln.
  if (looksLikeCsv(text)) return fileToEntries(text);
  const entries: SourceEntry[] = [];
  text.split(/\r?\n/).forEach((line, idx) => {
    for (const e of parseDeckList(line)) entries.push({ ...e, line: idx + 1 });
  });
  return {
    entries,
    mode: "text",
    problem: entries.length ? undefined : "Keine Karten erkannt. Ein Kartenname pro Zeile, z. B. „2x Lightning Bolt“.",
  };
}

export function fileToEntries(content: string): ParsedSource {
  const text = content.replace(/^﻿/, ""); // BOM aus Excel-Exporten
  const withIds = moxfieldCsvToEntries(text);
  if (withIds) {
    return {
      entries: withIds.map((m, idx) => ({ ...m, line: idx + 2 })),
      mode: "csv",
      problem: withIds.length ? undefined : "Die CSV hat eine Spalte „Scryfall ID“, aber keine Zeile mit ID.",
    };
  }
  const entries = csvToEntries(text).map((c, idx) => ({ ...c, line: idx + 1 }));
  return {
    entries,
    mode: "text",
    problem: entries.length ? undefined : "In der Datei wurden keine Karten gefunden (erwartet: Spalte „Name“).",
  };
}

/** Erste Zeile sieht nach CSV-Kopfzeile aus (Komma/Semikolon + Spalte Name). */
export function looksLikeCsv(text: string): boolean {
  const first = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0]?.toLowerCase() ?? "";
  return /[,;]/.test(first) && /(^|[,;"])\s*(name|card name|scryfall id)\s*("|[,;]|$)/.test(first);
}
