// Deutsche Kartennamen als kompakte Datei für den Scanner bauen:
//   node scripts/build-german-names.mjs
// Schreibt public/data/de-names.json: [[deutscherName, englischerName], …].
// Quelle: Scryfall-Suche über alle deutschen Drucke (eine Zeile je Karte und
// abweichendem deutschen Namen). Bei neuen Sets erneut ausführen – unbekannte
// Namen löst die App weiterhin über den Server auf.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public/data/de-names.json");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function page(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "MagicCollectionApp/1.0" } }).catch(() => null);
    if (res?.ok) return res.json();
    await sleep(1000 * (i + 1));
  }
  throw new Error(`Scryfall nicht erreichbar: ${url}`);
}

const pairs = new Map(); // "de|en" → [de, en]
let url = `https://api.scryfall.com/cards/search?${new URLSearchParams({ q: "lang:de game:paper", unique: "prints", order: "name" })}`;
let pages = 0;
while (url) {
  const data = await page(url);
  for (const c of data.data ?? []) {
    // gedruckter Name der Vorderseite (bei doppelseitigen Karten je Seite)
    const de = c.printed_name ?? c.card_faces?.[0]?.printed_name;
    if (!de || de === c.name) continue;
    const front = de.split(" // ")[0].trim();
    if (front.length >= 2) pairs.set(`${front}|${c.name}`, [front, c.name]);
  }
  url = data.has_more ? data.next_page : null;
  if (++pages % 25 === 0) console.log(`${pages} Seiten, ${pairs.size} Namen …`);
  await sleep(110);
}
const names = Array.from(pairs.values()).sort((a, b) => a[0].localeCompare(b[0], "de"));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ built: new Date().toISOString().slice(0, 10), names }));
console.log(`${names.length} deutsche Namen → ${out} (${Math.round(fs.statSync(out).size / 1024)} KB)`);
