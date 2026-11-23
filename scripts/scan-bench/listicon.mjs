// The-List-Symbol messen: node scripts/scan-bench/listicon.mjs <ordner mit pairs.json + img/> [seeds]
// pairs.json: [{ name, list: { id }, orig: { id, frame } }] – Bilder unter img/<id>.jpg
// Gibt die Merkmale je Bedingung aus und sucht Schwellen ohne Fehlalarme beim Original.
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
const seeds = Number(process.argv[3] ?? 3);
const area = process.env.AREA ? JSON.parse(process.env.AREA) : undefined;
const CONDITIONS = {
  ideal: { scale: [1, 1], offset: 0, rot: 0, blur: [0, 0], brightness: [1, 1], noise: 0, glare: 0, squash: 1 },
  typisch: { scale: [0.82, 1.02], offset: 0.05, rot: 3, blur: [0.4, 1.2], brightness: [0.8, 1.1], noise: 14, glare: 0.1, squash: 0.96 },
  schwer: { scale: [0.7, 1.05], offset: 0.09, rot: 7, blur: [1.0, 2.2], brightness: [0.55, 1.2], noise: 26, glare: 0.4, squash: 0.92 },
  fern: { scale: [0.5, 0.62], offset: 0.12, rot: 4, blur: [0.5, 1.2], brightness: [0.8, 1.1], noise: 14, glare: 0.1, squash: 0.96 },
  dunkel: { scale: [0.82, 1.02], offset: 0.05, rot: 3, blur: [0.8, 1.6], brightness: [0.3, 0.45], noise: 30, glare: 0, squash: 0.96 },
};
const bundle = await build({ entryPoints: [path.join(here, "harness.ts")], bundle: true, write: false, format: "esm", platform: "browser", alias: { "@": repo }, logLevel: "error" });
const js = bundle.outputFiles[0].text;
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (url === "/") return res.writeHead(200, { "content-type": "text/html" }).end('<script type="module" src="/harness.js"></script>');
  if (url === "/harness.js") return res.writeHead(200, { "content-type": "text/javascript" }).end(js);
  fs.readFile(path.join(data, url), (err, buf) => (err ? res.writeHead(404).end() : res.writeHead(200, { "content-type": "image/jpeg" }).end(buf)));
});
await new Promise((r) => server.listen(0, r));
const pairs = JSON.parse(fs.readFileSync(path.join(data, "pairs.json"), "utf8"));
const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (e) => console.error("PAGE", e.message));
await page.goto(`http://localhost:${server.address().port}/?refW=${process.env.REFW ?? 0}`);
await page.waitForFunction(() => window.bench);
const rows = [];
for (const [cn, cond] of Object.entries(CONDITIONS)) {
  for (let i = 0; i < pairs.length; i++) {
    for (let s = 0; s < seeds; s++) {
      for (const kind of ["list", "orig"]) {
        const p = pairs[i];
        const r = await page.evaluate(([c, l, o, cd, seed, ar]) => window.bench.listJudge(c, l, o, cd, seed, ar), [`/img/${p[kind].id}.jpg`, `/img/${p.list.id}.jpg`, `/img/${p.orig.id}.jpg`, cond, i * 7919 + s * 104729 + 13, area]);
        if (r) rows.push({ cond: cn, kind, frame: p.orig.frame, name: p.name, diff: r.sList - r.sOrig });
      }
    }
  }
}
fs.writeFileSync(path.join(data, `judge-${process.env.TAG ?? "x"}.json`), JSON.stringify(rows));
for (const m of [0.1, 0.15, 0.2]) {
  const line = [];
  for (const cn of Object.keys(CONDITIONS)) {
    const L = rows.filter((r) => r.cond === cn && r.kind === "list"), O = rows.filter((r) => r.cond === cn && r.kind === "orig");
    const tp = L.filter((r) => r.diff >= m).length, fp = O.filter((r) => r.diff >= m).length, fn = L.filter((r) => r.diff <= -m).length, tn = O.filter((r) => r.diff <= -m).length;
    line.push(`${cn} List ${tp}/${L.length} falsch ${fn} | Orig ${tn}/${O.length} falsch ${fp}`);
  }
  console.log(`Abstand ${m}: ` + line.join("  ·  "));
}
await browser.close();
server.close();
