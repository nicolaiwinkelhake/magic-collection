// Scanner-Messstand: node scripts/scan-bench/run.mjs <daten-ordner> [--limit N] [--throttle 4] [--only bedingung]
// <daten-ordner> enthält cards.json, names.json und img/<id>.jpg (nicht im Repo).
import { build } from "esbuild";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH ?? "playwright");

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const args = process.argv.slice(2);
const data = path.resolve(args[0] ?? ".");
const opt = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
const limit = Number(opt("limit", 9999));
const throttle = Number(opt("throttle", 4));
const only = opt("only", null);

export const CONDITIONS = {
  ideal: { scale: [1, 1], offset: 0, rot: 0, blur: [0, 0], brightness: [1, 1], noise: 0, glare: 0, squash: 1 },
  typisch: { scale: [0.82, 1.02], offset: 0.05, rot: 3, blur: [0.4, 1.2], brightness: [0.8, 1.1], noise: 14, glare: 0.1, squash: 0.96 },
  schwer: { scale: [0.7, 1.05], offset: 0.09, rot: 7, blur: [1.0, 2.2], brightness: [0.55, 1.2], noise: 26, glare: 0.4, squash: 0.92 },
  fern: { scale: [0.5, 0.62], offset: 0.12, rot: 4, blur: [0.5, 1.2], brightness: [0.8, 1.1], noise: 14, glare: 0.1, squash: 0.96 },
};

const bundle = await build({
  entryPoints: [path.join(here, "harness.ts")],
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  alias: { "@": repo },
  loader: { ".json": "json" },
  logLevel: "error",
});
const js = bundle.outputFiles[0].text;
const types = { ".js": "text/javascript", ".json": "application/json", ".jpg": "image/jpeg", ".gz": "application/gzip", ".wasm": "application/wasm" };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (url === "/") return res.writeHead(200, { "content-type": "text/html" }).end('<script type="module" src="/harness.js"></script>');
  if (url === "/harness.js") return res.writeHead(200, { "content-type": "text/javascript" }).end(js);
  const file = url.startsWith("/ocr/") ? path.join(repo, "public", url) : path.join(data, url);
  if (!file.startsWith(repo) && !file.startsWith(data)) return res.writeHead(403).end();
  fs.readFile(file, (err, buf) => (err ? res.writeHead(404).end() : res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" }).end(buf)));
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;

const allCards = JSON.parse(fs.readFileSync(path.join(data, "cards.json"), "utf8"));
const step = Math.max(1, Math.floor(allCards.length / limit));
const cards = allCards.filter((_, i) => i % step === 0).slice(0, limit);
const names = JSON.parse(fs.readFileSync(path.join(data, "names.json"), "utf8")).data;
const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (e) => console.error("PAGE", e.message));
await page.goto(base);
await page.waitForFunction(() => window.bench);
const own = Object.fromEntries((fs.existsSync(path.join(data, "own-sets.txt")) ? fs.readFileSync(path.join(data, "own-sets.txt"), "utf8") : "").split(/\s+/).filter(Boolean).map((x) => x.split(":")));
const sets = JSON.parse(fs.readFileSync(path.join(data, "sets.json"), "utf8")).data.map((s) => [s.code, Number(own[s.code] ?? 0) + (s.released_at > "2023" ? 0.5 : 0)]);
// deutsches Wörterbuch wie in der App (public/data/de-names.json)
const dePath = path.join(repo, "public/data/de-names.json");
const de = fs.existsSync(dePath) ? JSON.parse(fs.readFileSync(dePath, "utf8")).names : [];
await page.evaluate(([n, st, d]) => window.bench.init(n, st, d), [names, sets, de]);
if (throttle > 1) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
}

const norm = (s) => s.split(" // ")[0].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const pct = (a, b) => `${((100 * a) / Math.max(1, b)).toFixed(1)} %`;
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
const p90 = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.9)] ?? 0;
const all = {};
for (const [cname, cond] of Object.entries(CONDITIONS)) {
  if (only && only !== cname) continue;
  const rows = [];
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const r = await page.evaluate(([u, k, s, t]) => window.bench.run(u, k, s, t), [`/img/${c.id}.jpg`, cond, i * 7919 + cname.length, c.front ?? c.name]);
    const want = norm(c.front ?? c.name);
    const sureOk = r.sure ? norm(r.sure.name) === want : null;
    const infoOk = !!r.info && r.info.set === c.set && String(r.info.number) === String(c.number).replace(/^0+/, "").replace(/\D+$/, "");
    // sofort = Wörterbuch sicher; druck = über Set/Nr + Namensabgleich; netz = unscharfe Suche
    const outcome =
      sureOk === true ? "sofort" : sureOk === false ? "FALSCH" : infoOk && r.printCheck ? "druck" : r.fuzzy ? (norm(r.fuzzy) === want ? "netz" : "FALSCH") : "nichts";
    rows.push({ id: c.id, name: c.name, set: c.set, frame: c.frame, effects: c.effects, border: c.border, full_art: c.full_art, layout: c.layout, outcome, infoOk, ...r });
  }
  all[cname] = rows;
  const n = rows.length;
  const count = (o) => rows.filter((r) => r.outcome === o).length;
  console.log(
    `${cname.padEnd(8)} sofort richtig ${pct(count("sofort"), n).padStart(7)} | falsche Karte ${pct(count("FALSCH"), n).padStart(6)} | über Set/Nr ${pct(count("druck"), n).padStart(6)} | nur per Netz ${pct(count("netz"), n).padStart(6)} | nicht erkannt ${pct(count("nichts"), n).padStart(6)} || Druck gelesen ${pct(rows.filter((r) => r.infoOk).length, n).padStart(6)} | Karte genau gefunden ${pct(rows.filter((r) => r.cornerErr >= 0 && r.cornerErr < 0.04).length, n).padStart(6)} || Zeit bis Name: Median ${Math.round(median(rows.map((r) => r.nameMs)))} ms, P90 ${Math.round(p90(rows.map((r) => r.nameMs)))} ms; bis Druck: Median ${Math.round(median(rows.map((r) => r.totalMs)))} ms`,
  );
}
fs.writeFileSync(path.join(data, opt("out", "result.json")), JSON.stringify(all));
await browser.close();
server.close();
