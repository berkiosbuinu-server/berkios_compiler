import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { LEXICON_DATA } from "../src/lexicons/index.mjs";
import { availableLanguages, getLexicon } from "../src/index.mjs";
import * as browser from "../src/browser.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("le registre des langues correspond aux fichiers du dossier lexicons", () => {
  const files = readdirSync(path.join(root, "src/lexicons")).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
  assert.deepEqual(Object.keys(LEXICON_DATA).sort(), files, "ajoutez la nouvelle langue dans src/lexicons/index.mjs");
  assert.deepEqual(availableLanguages(), files);
  for (const code of files) assert.equal(getLexicon(code).code, code);
});

test("l'entrée navigateur n'importe aucun module Node.js (directement ou indirectement)", () => {
  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/^\s*(?:import\s+(?:[^;\n]*?\s+from\s+)?|export\s+[^;\n]*?\s+from\s+)["']([^"']+)["']/gm)) {
      const spec = m[1];
      assert.ok(spec.startsWith("./") || spec.startsWith("../"), `${path.relative(root, file)} importe « ${spec} » (module non relatif : interdit dans la version navigateur)`);
      if (spec.endsWith(".mjs")) walk(path.resolve(path.dirname(file), spec));
    }
    assert.ok(!/\brequire\(|\bprocess\.|["']node:/.test(text.replace(/\/\/.*$/gm, "")), `${path.relative(root, file)} utilise une API Node.js`);
  };
  walk(path.join(root, "src/browser.mjs"));
  assert.ok(seen.size >= 8, "le graphe d'imports doit contenir le compilateur complet");
});

test("compiler, traduire et exécuter fonctionnent via l'entrée navigateur", () => {
  const src = readFileSync(path.join(root, "examples/stock.fr.bk"), "utf8");
  const r = browser.compile(src);
  assert.equal(r.ok, true);
  assert.equal(r.project.name, "Gestion de stock");
  const en = browser.translate(src, "en");
  assert.equal(en.ok, true);
  assert.equal(browser.compile(en.text).ok, true);
  const cli = browser.compile(readFileSync(path.join(root, "examples/outils.fr.bk"), "utf8"));
  const lines = [];
  assert.equal(browser.runCli(cli.cli, ["saluer", "Alice"], { out: (s) => lines.push(s), err: (s) => lines.push(s) }), 0);
  assert.deepEqual(lines, ["Bonjour Alice"]);
  const out = [];
  browser.runCore(browser.parseCore(readFileSync(path.join(root, "examples/core/multilingual/complete-en.bks"), "utf8")), { out: (s) => out.push(s) });
  assert.ok(out[0].startsWith("Order total"));
});

test("le fichier d'exemples du terrain de jeu est à jour", async () => {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(process.execPath, [path.join(root, "scripts/build-web-examples.mjs"), "--check"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});

test("la version affichée par la CLI correspond à package.json", async () => {
  const { spawnSync } = await import("node:child_process");
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  const r = spawnSync(process.execPath, [path.join(root, "bin/berkios.mjs"), "--version"], { encoding: "utf8", env: { ...process.env, BERKIOS_HOME: path.join(root, ".tmp-home-test") } });
  assert.equal(r.stdout.trim(), pkg.version);
});
