import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, copyFileSync, writeFileSync, readFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { startPreview, compileForPreview } from "../src/preview.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const get = (url, { method = "GET", headers = {}, rawPath } = {}) => new Promise((resolve, reject) => {
  const u = new URL(url);
  const req = http.request({ host: u.hostname, port: u.port, path: rawPath ?? u.pathname, method, headers }, (res) => {
    const chunks = []; res.on("data", (c) => chunks.push(c)); res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
  });
  req.on("error", reject); req.end();
});

async function withServer(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "bk-preview-"));
  const file = path.join(dir, "app.bk");
  copyFileSync(path.join(root, "examples/stock.fr.bk"), file);
  const server = await startPreview({ file, port: 0, open: false });
  try { await fn({ server, file, dir }); } finally { await server.close(); }
}

test("l'aperçu sert la page, le projet compilé et les fichiers du moteur", () => withServer(async ({ server }) => {
  const page = await get(server.url);
  assert.equal(page.status, 200);
  assert.match(page.headers["content-type"], /text\/html/);
  assert.match(page.headers["content-security-policy"], /script-src 'self'/);
  const data = JSON.parse((await get(server.url + "project.json")).body);
  assert.equal(data.ok, true);
  assert.equal(data.project.name, "Gestion de stock");
  const js = await get(server.url + "web/berkios-web.mjs");
  assert.equal(js.status, 200);
  assert.match(js.headers["content-type"], /javascript/);
  assert.equal((await get(server.url + "web/berkios-web.css")).status, 200);
}));

test("sécurité : mauvais Host refusé, chemins hors liste refusés, méthodes non GET refusées", () => withServer(async ({ server }) => {
  assert.equal((await get(server.url, { headers: { host: "evil.example" } })).status, 403);
  assert.equal((await get(server.url, { headers: { host: "127.0.0.1:1" } })).status, 403);
  // (« /web/.. » est normalisé en « / » par l'analyse d'URL : c'est la page d'accueil, pas un listing de fichiers.)
  for (const p of ["/web/%2e%2e/src/cli.mjs", "/web/../src/cli.mjs", "/web/examples-data.mjs", "/src/cli.mjs", "/package.json", "/web/", "/web/nope.mjs"]) {
    assert.equal((await get(server.url, { rawPath: p })).status, 404, p);
  }
  assert.equal((await get(server.url, { method: "POST" })).status, 405);
}));

test("une modification du fichier est détectée : nouvelle version et projet recompilé", () => withServer(async ({ server, file }) => {
  const first = JSON.parse((await get(server.url + "project.json")).body);
  const events = await new Promise((resolve) => {
    const seen = [];
    const req = http.get(server.url + "events", (res) => {
      res.setEncoding("utf8");
      res.on("data", (c) => { seen.push(c.trim()); if (seen.length === 1) { writeFileSync(file, readFileSync(file, "utf8").replace("Gestion de stock", "Stock v2")); utimesSync(file, new Date(), new Date(Date.now() + 5000)); } if (seen.length >= 2) { req.destroy(); resolve(seen); } });
    });
    setTimeout(() => { req.destroy(); resolve(seen); }, 4000);
  });
  assert.deepEqual(events.map((e) => e.replace("data: ", "")), ["0", "1"]);
  const second = JSON.parse((await get(server.url + "project.json")).body);
  assert.equal(second.version, first.version + 1);
  assert.equal(second.project.name, "Stock v2");
}));

test("erreurs de compilation et applications en ligne de commande", () => withServer(async ({ server, file, dir }) => {
  writeFileSync(file, 'langue français\n\napplication "X"\n  type interface\n\ninterface A\n  bouton b "Ok"\n    quand on clique : ouvrir Nulle\n');
  const data = JSON.parse((await get(server.url + "project.json")).body);
  assert.equal(data.ok, false);
  assert.match(data.errors[0], /Nulle/);
  const cli = path.join(dir, "cli.bk");
  copyFileSync(path.join(root, "examples/outils.fr.bk"), cli);
  const r = compileForPreview(cli);
  assert.equal(r.isCli, true);
  assert.equal(r.ok, false);
}));
