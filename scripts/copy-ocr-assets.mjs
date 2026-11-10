// Texterkennung (tesseract.js) selbst ausliefern statt vom CDN zu laden:
// Worker, WebAssembly-Kern und Sprachdaten (Deutsch + Englisch) werden vor
// dem Build/Dev-Start nach public/ocr/<version>/ kopiert. Vorteile: kein
// Ausfall, wenn das CDN hakt, schneller (gleiche Domain), offline cachebar.
// Die Version steht im Pfad – der Service Worker darf die Dateien daher
// dauerhaft cachen.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkgDir = (name) => dirname(require.resolve(`${name}/package.json`));

const version = JSON.parse(readFileSync(join(pkgDir("tesseract.js"), "package.json"), "utf8")).version;
const outRoot = join(process.cwd(), "public", "ocr");
const out = join(outRoot, version);

if (existsSync(join(out, "lang", "deu.traineddata.gz"))) {
  console.log(`[ocr] Dateien für tesseract.js ${version} vorhanden.`);
  process.exit(0);
}

rmSync(outRoot, { recursive: true, force: true });
mkdirSync(join(out, "lang"), { recursive: true });

cpSync(join(pkgDir("tesseract.js"), "dist", "worker.min.js"), join(out, "worker.min.js"));
// Nur LSTM-Kerne (OEM 1): mit und ohne SIMD – der Worker wählt passend.
for (const f of ["tesseract-core-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js"]) {
  cpSync(join(pkgDir("tesseract.js-core"), f), join(out, f));
}
for (const lang of ["eng", "deu"]) {
  cpSync(
    join(pkgDir(`@tesseract.js-data/${lang}`), "4.0.0_best_int", `${lang}.traineddata.gz`),
    join(out, "lang", `${lang}.traineddata.gz`),
  );
}
console.log(`[ocr] tesseract.js ${version} nach public/ocr/${version} kopiert.`);
