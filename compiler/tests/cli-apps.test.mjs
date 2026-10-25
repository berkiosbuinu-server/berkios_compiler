import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { compile, translate, parse, stripLoc, runCli, exportScript } from "../src/index.mjs";
import { run } from "../src/cli.mjs";

const example = (name) => readFileSync(new URL(`../examples/${name}`, import.meta.url), "utf8");
const codes = (r) => r.diagnostics.map((d) => d.code);
const withoutLang = (ir) => { const c = JSON.parse(JSON.stringify(ir)); delete c.i18n; delete c.sourceLanguage; return c; };

/** Compile un programme et l'exécute avec des arguments ; renvoie { code, out, err }. */
function exec(src, args = []) {
  const r = compile(src);
  assert.ok(r.ok, JSON.stringify(r.diagnostics));
  const out = [], err = [];
  const code = runCli(r.cli, args, { out: (s) => out.push(s), err: (s) => err.push(s) });
  return { code, out: out.join("\n"), err: err.join("\n") };
}
const fr = (body, head = "") => `langue français\n\napplication "T"\n  type commande\n\ncommande t\n${head}  action\n${body.split("\n").map((l) => `    ${l}`).join("\n")}\n`;
const OUTILS = example("outils.fr.bk");
const tool = (args) => exec(OUTILS, args);

/* ───────── Compilation ───────── */

test("une application en ligne de commande se compile en représentation « cli »", () => {
  const r = compile(OUTILS);
  assert.ok(r.ok, JSON.stringify(r.diagnostics));
  assert.equal(r.project, undefined);
  assert.equal(r.cli.kind, "cli");
  assert.deepEqual(r.cli.commands.map((c) => c.id), ["saluer", "calculer", "compter"]);
  const saluer = r.cli.commands[0];
  assert.deepEqual(saluer.params.map((p) => [p.flag, p.type, p.default, !!p.required]), [["nom", "text", "", true], ["repetitions", "integer", 1, false], ["fort", "boolean", false, false]]);
});

test("le même programme en français et en anglais donne la même représentation", () => {
  const en = translate(OUTILS, "en");
  assert.ok(en.ok, JSON.stringify(en.diagnostics));
  const a = compile(OUTILS), b = compile(en.text);
  assert.ok(b.ok, JSON.stringify(b.diagnostics));
  assert.equal(b.language, "en");
  assert.deepEqual(withoutLang(a.cli), withoutLang(b.cli));
  assert.equal(example("tools.en.bk"), en.text);
});

test("traduire fr → en → fr est sans perte, expressions et conditions comprises", () => {
  const src = fr('définir x comme (1 + 2) * 3 - -4\nsi non_vide est différent de "" alors\n  afficher "a" et x et (x + 1)\nsinon\n  arrêter', "  argument non_vide : texte\n");
  const en = translate(src, "en");
  assert.ok(en.ok, JSON.stringify(en.diagnostics));
  const back = translate(en.text, "fr");
  assert.ok(back.ok);
  assert.deepEqual(stripLoc(parse(back.text).ast), stripLoc(parse(src).ast));
});

test("une traduction qui changerait le sens est refusée (nom devenu mot vide dans l'autre langue)", () => {
  const src = fr("afficher a", "  argument a : texte, obligatoire\n");
  assert.ok(compile(src).ok);
  const r = translate(src, "en");
  assert.ok(!r.ok);
  assert.equal(r.diagnostics[0].code, "E_TRANSLATE_UNSAFE");
});

test("l'exemple anglais natif se compile et s'exécute avec ses messages en anglais", () => {
  const src = example("greet.en.bk");
  assert.deepEqual(exec(src, ["Ann", "--count", "2"]), { code: 0, out: "Hello Ann\nHello Ann", err: "" });
  const missing = exec(src, []);
  assert.equal(missing.code, 2);
  assert.match(missing.err, /Missing argument: name/);
  assert.match(missing.err, /--help/);
  assert.equal(compile(src).cli.version, "2.0.0");
});

/* ───────── Exécution ───────── */

test("saluer : arguments, options et booléens", () => {
  assert.deepEqual(tool(["saluer", "Alice"]), { code: 0, out: "Bonjour Alice", err: "" });
  assert.equal(tool(["saluer", "Alice", "--répétitions", "2", "--fort"]).out, "BONJOUR Alice\nBONJOUR Alice");
  assert.equal(tool(["saluer", "Alice", "--repetitions=2"]).out, "Bonjour Alice\nBonjour Alice");
  assert.equal(tool(["saluer", "Alice", "--fort=non"]).out, "Bonjour Alice");
  assert.equal(tool(["SALUER", "Bob"]).out, "Bonjour Bob");
});

test("calculer : priorités, décimaux, négatifs, division par zéro", () => {
  assert.equal(tool(["calculer", "6", "*", "7"]).out, "42");
  assert.equal(tool(["calculer", "0.1", "+", "0.2"]).out, "0.3");
  assert.equal(tool(["calculer", "-5", "+", "3"]).out, "-2");
  assert.equal(tool(["calculer", "7", "/", "2"]).out, "3.5");
  const dz = tool(["calculer", "1", "/", "0"]);
  assert.deepEqual([dz.code, dz.err], [1, "Division par zéro"]);
  const bad = tool(["calculer", "1", "?", "2"]);
  assert.deepEqual([bad.code, bad.err], [2, "Opération inconnue : ?"]);
});

test("compter : variables modifiées dans une boucle et parenthèses", () => {
  assert.equal(tool(["compter", "3"]).out, "Étape 1 sur 3\nÉtape 2 sur 3\nÉtape 3 sur 3\nTerminé : 6 points");
});

test("expressions : priorité des opérateurs, concaténation, booléens, comparaisons", () => {
  assert.equal(exec(fr("afficher 2 + 3 * 4")).out, "14");
  assert.equal(exec(fr("afficher (2 + 3) * 4")).out, "20");
  assert.equal(exec(fr("afficher 10 - 4 - 3")).out, "3");
  assert.equal(exec(fr('afficher "n=" et 1 + 1 et " ok"')).out, "n=2 ok");
  assert.equal(exec(fr("afficher vrai et faux")).out, "vraifaux");
  assert.equal(exec(fr('si "10" est supérieur à 9 alors\n  afficher "num"\nsinon\n  afficher "txt"')).out, "num");
  assert.equal(exec(fr('si "abc" est inférieur à "abd" alors\n  afficher "lt"')).out, "lt");
  assert.equal(exec(fr('si 3 est supérieur ou égal à 3 alors\n  afficher "ge"')).out, "ge");
  assert.equal(exec(fr('si 3 n’est pas égal à 4 alors\n  afficher "ne"')).out, "ne");
});

test("« arrêter » renvoie le code de sortie demandé", () => {
  assert.equal(exec(fr("arrêter avec le code 7")).code, 7);
  assert.equal(exec(fr("afficher 1\narrêter\nafficher 2")).out, "1");
  assert.equal(exec(fr("arrêter avec le code 1.5")).code, 1);
});

test("erreurs d'utilisation : code 2 et message localisé", () => {
  const cases = [
    [["compter"], /Argument manquant : limite/],
    [["compter", "abc"], /Valeur invalide pour limite : « abc » \(nombre entier attendu\)/],
    [["compter", "1", "2"], /Trop d’arguments : « 2 »/],
    [["saluer", "A", "--zzz"], /Option inconnue : --zzz/],
    [["saluer", "A", "--répétitions"], /attend une valeur/],
    [["inconnue"], /Commande inconnue : inconnue/],
  ];
  for (const [args, re] of cases) {
    const r = tool(args);
    assert.equal(r.code, 2, args.join(" "));
    assert.match(r.err, re, args.join(" "));
    assert.match(r.err, /Aide : outils --aide/);
  }
});

test("« -- » termine les options : la valeur suivante est un argument", () => {
  assert.equal(tool(["saluer", "--", "--fort"]).out, "Bonjour --fort");
});

test("aide de l'application et de chaque commande", () => {
  const app = tool([]);
  assert.equal(app.code, 0);
  assert.match(app.out, /Outils 1\.0\.0/);
  assert.match(app.out, /saluer\s+Dit bonjour/);
  assert.match(app.out, /calculer\s+Applique/);
  const cmd = tool(["saluer", "--aide"]);
  assert.equal(cmd.code, 0);
  assert.match(cmd.out, /Utilisation : outils saluer <nom> \[--repetitions <nombre entier>\] \[--fort\]/);
  assert.match(cmd.out, /--repetitions\s+nombre entier, par défaut 1/);
  assert.match(cmd.out, /nom\s+texte, obligatoire/);
});

test("garde-fou : une boucle démesurée est arrêtée avec une erreur claire", () => {
  const r = exec(fr("répéter 100000000 fois\n  définir x comme 1"));
  assert.equal(r.code, 1);
  assert.match(r.err, /Trop de répétitions/);
});

test("erreurs d'exécution : texte non numérique, condition non booléenne", () => {
  const a = exec(fr('afficher "abc" + 1'));
  assert.deepEqual([a.code, a.err], [1, "Calcul impossible : « abc » n’est pas un nombre."]);
  const b = exec(fr('si "x" alors\n  afficher 1'));
  assert.equal(b.code, 1);
  assert.match(b.err, /ni vrai ni faux/);
});

/* ───────── Erreurs de compilation ───────── */

test("variable inconnue : suggestion ; argument non redéfinissable", () => {
  const r = compile(fr("afficher nomm\ndéfinir nom comme 3", "  argument nom : texte\n"));
  assert.deepEqual(codes(r).sort(), ["E_ASSIGN_PARAM", "E_UNKNOWN_REF"]);
  assert.match(r.diagnostics.find((d) => d.code === "E_UNKNOWN_REF").message, /Vouliez-vous dire « nom »/);
});

test("une variable définie dans un bloc n'existe pas après ce bloc", () => {
  assert.ok(codes(compile(fr("si vrai alors\n  définir x comme 1\nafficher x"))).includes("E_UNKNOWN_REF"));
  assert.ok(compile(fr("définir x comme 1\nsi vrai alors\n  définir x comme 2\nafficher x")).ok);
});

test("structure : sinon seul, action manquante, valeur par défaut incohérente, doublons", () => {
  assert.ok(codes(compile(fr("sinon\n  afficher 1"))).includes("E_ELSE_ALONE"));
  assert.ok(codes(compile('langue français\n\napplication "T"\n  type commande\n\ncommande t\n  description "x"\n')).includes("E_NO_ACTION"));
  assert.ok(codes(compile(fr("afficher 1", '  option n : nombre entier, par défaut "x"\n'))).includes("E_BAD_DEFAULT"));
  assert.ok(codes(compile(fr("afficher 1", "  argument n : texte\n  option N : texte\n"))).includes("E_DUP"));
});

test("commandes et interfaces ne se mélangent pas dans une même application", () => {
  assert.ok(codes(compile('langue français\n\napplication "T"\n\ninterface X\n\ncommande c\n  action\n    afficher 1\n')).includes("E_CLI_ONLY"));
  assert.ok(codes(compile('langue français\n\napplication "T"\n  type commande\n\ninterface X\n\ncommande c\n  action\n    afficher 1\n')).includes("E_CLI_NO_UI"));
  assert.ok(codes(compile('langue français\n\napplication "T"\n  type commande\n')).includes("E_NO_COMMAND"));
});

test("un mot-clé d'une autre langue dans une action est refusé (un fichier = une langue)", () => {
  const r = compile(fr('print "x"'));
  const d = r.diagnostics.find((x) => x.code === "E_MIXED_LANGUAGE");
  assert.ok(d, JSON.stringify(r.diagnostics));
  assert.match(d.message, /une seule langue/);
});

/* ───────── Script exporté et ligne de commande ───────── */

test("le script exporté tourne avec Node seul et propage le code de sortie", () => {
  const dir = mkdtempSync(join(tmpdir(), "bk-export-"));
  try {
    const file = join(dir, "outils.mjs");
    writeFileSync(file, exportScript(compile(OUTILS).cli), "utf8");
    const ok = spawnSync(process.execPath, [file, "calculer", "6", "*", "7"], { encoding: "utf8" });
    assert.deepEqual([ok.status, ok.stdout.trim()], [0, "42"]);
    const dz = spawnSync(process.execPath, [file, "calculer", "1", "/", "0"], { encoding: "utf8" });
    assert.deepEqual([dz.status, dz.stderr.trim()], [1, "Division par zéro"]);
    const usage = spawnSync(process.execPath, [file, "compter"], { encoding: "utf8" });
    assert.equal(usage.status, 2);
    assert.match(usage.stderr, /Argument manquant/);
    assert.match(spawnSync(process.execPath, [file, "--version"], { encoding: "utf8" }).stdout, /Outils 1\.0\.0/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

function cli(args, home) {
  process.env.BERKIOS_HOME = home;
  const out = [], err = [];
  const code = run(args, { out: (s) => out.push(s), err: (s) => err.push(s) });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

test("CLI : « nouveau --type commande » crée une application valide et exécutable, dans chaque langue", () => {
  const home = mkdtempSync(join(tmpdir(), "bk-home-"));
  const work = mkdtempSync(join(tmpdir(), "bk-work-"));
  try {
    for (const [lang, name, expected] of [["fr", "Zoé", "Bonjour Zoé"], ["en", "Zoe", "Hello Zoe"]]) {
      cli(["-m", "--lg", `--${lang}`], home); cli(["--lg", `--${lang}`], home);
      const file = join(work, `outil.${lang}.bk`);
      assert.equal(cli(["new", file, "--type", lang === "fr" ? "commande" : "command"], home).code, 0);
      assert.equal(cli(["validate", file], home).code, 0);
      const r = cli([lang === "fr" ? "lancer" : "run", file, name], home);
      assert.deepEqual([r.code, r.out], [0, expected]);
    }
    assert.equal(cli(["new", join(work, "x.bk"), "--type", "zzz"], home).code, 1);
  } finally { rmSync(home, { recursive: true, force: true }); rmSync(work, { recursive: true, force: true }); }
});

test("CLI : « lancer » transmet --aide et les options à l'application ; compiler/exporter écrivent leurs fichiers", () => {
  const home = mkdtempSync(join(tmpdir(), "bk-home-"));
  const work = mkdtempSync(join(tmpdir(), "bk-work-"));
  try {
    cli(["--lg", "--fr"], home);
    const file = join(work, "outils.bk");
    writeFileSync(file, OUTILS, "utf8");
    const help = cli(["lancer", file, "saluer", "--aide"], home);
    assert.equal(help.code, 0);
    assert.match(help.out, /Utilisation : outils saluer/);
    assert.equal(cli(["lancer", file, "compter", "2"], home).out, "Étape 1 sur 2\nÉtape 2 sur 2\nTerminé : 4 points");
    assert.equal(cli(["lancer", file, "calculer", "1", "/", "0"], home).code, 1);
    const json = join(work, "app.json"), mjs = join(work, "app.mjs");
    assert.equal(cli(["compiler", file, "-o", json], home).code, 0);
    assert.equal(JSON.parse(readFileSync(json, "utf8")).kind, "cli");
    assert.equal(cli(["exporter", file, "-o", mjs], home).code, 0);
    assert.ok(existsSync(mjs));
    // sur une application à interface, lancer/exporter expliquent que ce n'est pas possible
    const ui = join(work, "ui.bk");
    cli(["new", ui], home);
    assert.equal(cli(["lancer", ui], home).code, 1);
    assert.equal(cli(["exporter", ui], home).code, 1);
  } finally { rmSync(home, { recursive: true, force: true }); rmSync(work, { recursive: true, force: true }); }
});
