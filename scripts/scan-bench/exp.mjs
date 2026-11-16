// Varianten vergleichen: node exp.mjs <daten> <limit> — nutzt run.mjs-Aufbau in klein
import { build } from "esbuild";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH ?? "playwright");
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const data = path.resolve(process.argv[2]);
const limit = Number(process.argv[3] ?? 60);
const variants = JSON.parse(fs.readFileSync(process.argv[4], "utf8"));
const condName = process.argv[5] ?? "typisch";
const CONDITIONS = {
  ideal: { scale: [1, 1], offset: 0, rot: 0, blur: [0, 0], brightness: [1, 1], noise: 0, glare: 0, squash: 1 },
  typisch: { scale: [0.82, 1.02], offset: 0.05, rot: 3, blur: [0.4, 1.2], brightness: [0.8, 1.1], noise: 14, glare: 0.1, squash: 0.96 },
  schwer: { scale: [0.7, 1.05], offset: 0.09, rot: 7, blur: [1.0, 2.2], brightness: [0.55, 1.2], noise: 26, glare: 0.4, squash: 0.92 },
};
const bundle = await build({ entryPoints: [path.join(here, "harness.ts")], bundle: true, write: false, format: "esm", platform: "browser", alias: { "@": repo }, logLevel: "error" });
const js = bundle.outputFiles[0].text;
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (url === "/") return res.writeHead(200, { "content-type": "text/html" }).end('<script type="module" src="/harness.js"></script>');
  if (url === "/harness.js") return res.writeHead(200, { "content-type": "text/javascript" }).end(js);
  const file = url.startsWith("/ocr/") ? path.join(repo, "public", url) : path.join(data, url);
  const types = { ".js": "text/javascript", ".json": "application/json", ".jpg": "image/jpeg", ".gz": "application/gzip" };
  fs.readFile(file, (err, buf) => (err ? res.writeHead(404).end() : res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" }).end(buf)));
});
await new Promise((r) => server.listen(0, r));
const all = JSON.parse(fs.readFileSync(path.join(data, "cards.json"), "utf8"));
const step = Math.max(1, Math.floor(all.length / limit));
const cards = all.filter((_, i) => i % step === 0).slice(0, limit);
const names = JSON.parse(fs.readFileSync(path.join(data, "names.json"), "utf8")).data;
const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (e) => console.error("PAGE", e.message));
await page.goto(`http://localhost:${server.address().port}`);
await page.waitForFunction(() => window.bench);
const own = Object.fromEntries((fs.existsSync(path.join(data, "own-sets.txt")) ? fs.readFileSync(path.join(data, "own-sets.txt"), "utf8") : "").split(/\s+/).filter(Boolean).map((x) => x.split(":")));
const sets = JSON.parse(fs.readFileSync(path.join(data, "sets.json"), "utf8")).data.map((s) => [s.code, Number(own[s.code] ?? 0) + (s.released_at > "2023" ? 0.5 : 0)]);
await page.evaluate(([n, st]) => window.bench.init(n, st), [names, sets]);
const norm = (s) => s.split(" // ")[0].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
const dump = process.argv[6];
for (const [vn, v] of Object.entries(variants)) {
  let sure = 0, wrong = 0, best = 0, info = 0, setOk = 0, numOk = 0; const nm = [], im = []; const rows = []; let qfound = 0, qgood = 0; const qm = [];
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const r = await page.evaluate(([u, k, s, o]) => window.bench.experiment(u, k, s, o), [`/img/${c.id}.jpg`, CONDITIONS[condName], i * 7919 + 7, v]);
    const want = norm(c.front ?? c.name);
    if (r.sure) (norm(r.sure.name) === want ? sure++ : wrong++);
    if (r.best && norm(r.best.name) === want) best++;
    const num = String(c.number).replace(/^0+/, "").replace(/\D+$/, "");
    const s = r.info.set === c.set, n = String(r.info.number) === num;
    if (s) setOk++; if (n) numOk++; if (s && n) info++;
    nm.push(r.nameMs); im.push(r.infoMs); if (r.cornerErr >= 0) { qfound++; if (r.cornerErr < 0.04) qgood++; } qm.push(r.quadMs);
    rows.push({ name: c.name, set: c.set, number: c.number, frame: c.frame, read: r.names, sure: r.sure?.name, cornerErr: r.cornerErr, infoRaw: r.infoRaw, info: r.info });
  }
  const n = cards.length, p = (x) => `${((100 * x) / n).toFixed(0)}%`.padStart(4);
  console.log(`${vn.padEnd(26)} sicher+richtig ${p(sure)} falsch ${p(wrong)} bester-Treffer ${p(best)} | Set+Nr ${p(info)} (Set ${p(setOk)}, Nr ${p(numOk)}) | Name ${Math.round(med(nm))} ms, Info ${Math.round(med(im))} ms | Viereck gefunden ${p(qfound)} genau ${p(qgood)} ${med(qm).toFixed(1)} ms`);
  if (dump) fs.writeFileSync(`${dump}-${vn}.json`, JSON.stringify(rows, null, 1));
}
await browser.close();
server.close();
