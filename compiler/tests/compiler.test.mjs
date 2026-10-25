import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { compile, translate, parse, stripLoc, availableLanguages, getLexicon } from "../src/index.mjs";
import { CTX, PROPS_BY_KIND, widgetContext } from "../src/parser.mjs";
import { run } from "../src/cli.mjs";

const NOW = "2026-01-01T00:00:00.000Z";
const example = (name) => readFileSync(new URL(`../examples/${name}`, import.meta.url), "utf8");
const build = (src, extra = {}) => compile(src, { now: NOW, ...extra });
const codes = (r) => r.diagnostics.map((d) => d.code);
const neutral = (p) => { const c = JSON.parse(JSON.stringify(p)); c["x-berkios"].sourceLanguage = "*"; return c; };

/* ───────── Lexiques ───────── */

test("les lexiques espagnol et swahili sont disponibles et compilent une application minimale", () => {
  const es = build('idioma español\n\naplicación "Prueba"\n\ninterfaz Inicio\n  botón aceptar "Aceptar"\n');
  const sw = build('lugha kiswahili\n\nprogramu "Jaribio"\n\nkiolesura Mwanzo\n  kitufe kubali "Kubali"\n');
  assert.ok(es.ok, JSON.stringify(es.diagnostics));
  assert.ok(sw.ok, JSON.stringify(sw.diagnostics));
  assert.equal(es.language, "es");
  assert.equal(sw.language, "sw");
  assert.deepEqual(neutral(es.project).widgets.map((w) => w.type), ["button"]);
  assert.deepEqual(neutral(sw.project).widgets.map((w) => w.type), ["button"]);
});

test("chaque langue définit exactement les mêmes mots-clés et les mêmes messages", () => {
  const [ref, ...others] = availableLanguages().map((c) => getLexicon(c).raw);
  for (const raw of others) {
    assert.deepEqual(Object.keys(raw.words).sort(), Object.keys(ref.words).sort(), `mots-clés de ${raw.code}`);
    assert.deepEqual(Object.keys(raw.messages).sort(), Object.keys(ref.messages).sort(), `messages de ${raw.code}`);
  }
});

test("aucune ambiguïté : dans un même contexte, deux mots-clés ne partagent jamais la même forme", () => {
  const contexts = { ...CTX };
  for (const kind of Object.keys(PROPS_BY_KIND)) contexts[`widget:${kind}`] = widgetContext(kind);
  for (const code of availableLanguages()) {
    const lex = getLexicon(code);
    for (const [name, ids] of Object.entries(contexts)) {
      const seen = new Map();
      for (const p of lex.phrases(ids)) {
        const k = p.seq.join(" ");
        if (seen.has(k) && seen.get(k) !== p.id) assert.fail(`${code}/${name} : « ${p.raw} » est ambigu entre ${seen.get(k)} et ${p.id}`);
        seen.set(k, p.id);
      }
    }
  }
});

/* ───────── Le cœur du langage : une sémantique, plusieurs vocabulaires ───────── */

test("le même programme en français et en anglais donne exactement le même projet", () => {
  const fr = build(example("stock.fr.bk")), en = build(example("stock.en.bk"));
  assert.ok(fr.ok && en.ok, JSON.stringify([...fr.diagnostics, ...en.diagnostics]));
  assert.equal(fr.language, "fr");
  assert.equal(en.language, "en");
  assert.deepEqual(neutral(fr.project), neutral(en.project));
});

test("traduire fr → en → fr est sans perte", () => {
  const original = example("stock.fr.bk");
  const en = translate(original, "en");
  assert.ok(en.ok);
  const back = translate(en.text, "fr");
  assert.ok(back.ok);
  assert.deepEqual(stripLoc(parse(back.text).ast), stripLoc(parse(original).ast));
  assert.deepEqual(neutral(build(back.text).project), neutral(build(original).project));
});

test("la sortie est déterministe", () => {
  assert.equal(JSON.stringify(build(example("stock.fr.bk")).project), JSON.stringify(build(example("stock.fr.bk")).project));
});

/* ───────── Une seule langue par fichier ───────── */

test("un mot-clé d'une autre langue est refusé avec un message explicite (fichier français)", () => {
  const r = build('langue français\n\napplication "A"\n\ninterface Accueil\n  button ok "Ok"\n');
  assert.ok(!r.ok);
  const d = r.diagnostics.find((x) => x.code === "E_MIXED_LANGUAGE");
  assert.ok(d, JSON.stringify(r.diagnostics));
  assert.match(d.message, /une seule langue/);
  assert.equal(d.line, 6);
});

test("un mot-clé d'une autre langue est refusé avec un message explicite (fichier anglais)", () => {
  const r = build('language english\n\napplication "A"\n\ninterface Home\n  bouton ok "Ok"\n');
  const d = r.diagnostics.find((x) => x.code === "E_MIXED_LANGUAGE");
  assert.ok(d);
  assert.match(d.message, /one language/);
});

test("sans déclaration de langue : la langue par défaut est utilisée, sinon erreur", () => {
  const src = 'application "A"\n\ninterface Accueil\n  bouton ok "Ok"\n';
  assert.ok(build(src, { language: "fr" }).ok);
  const none = build(src);
  assert.ok(!none.ok);
  assert.deepEqual(codes(none), ["E_NO_LANGUAGE"]);
});

test("une langue inconnue dans la déclaration est signalée", () => {
  assert.ok(codes(build('langue klingon\n\napplication "A"\n')).includes("E_LANGUAGE_VALUE"));
});

test("accents et majuscules sont facultatifs dans les mots-clés", () => {
  const r = build('LANGUE Francais\n\nApplication "A"\n\nMODELE Produit\n  nom : TEXTE\n\nInterface Accueil\n  Etiquette t "Bonjour"\n');
  assert.ok(r.ok, JSON.stringify(r.diagnostics));
});

/* ───────── Erreurs lisibles ───────── */

test("référence inconnue : erreur avec suggestion", () => {
  const r = build(example("stock.fr.bk").replace("source : Produit", "source : Produits"));
  const d = r.diagnostics.find((x) => x.code === "E_UNKNOWN_REF");
  assert.ok(d);
  assert.match(d.message, /Vouliez-vous dire « Produit »/);
});

test("mot-clé mal écrit : suggestion", () => {
  const r = build('langue français\n\napplication "A"\n\ninterface Accueil\n  boutton ok "Ok"\n');
  const d = r.diagnostics.find((x) => x.code === "E_UNKNOWN_KEYWORD");
  assert.ok(d);
  assert.match(d.message, /bouton/);
});

test("plusieurs erreurs de syntaxe sont rapportées en une seule passe, triées par ligne", () => {
  const r = build('langue français\n\napplication "A"\n\ninterface Accueil\n  boutton a "A"\n  bouton b "B"\n  étiquette c "C"\n    couleur rouge\n');
  assert.ok(!r.ok);
  assert.deepEqual(r.diagnostics.map((d) => d.line), [6, 9]);
});

test("plusieurs erreurs de sens sont rapportées en une seule passe, et seulement quand la syntaxe est correcte", () => {
  const semantic = 'langue français\n\napplication "A"\n\ninterface Accueil\n  bouton b "B"\n    quand on clique : ouvrir Nulle part\n  bouton b "B2"\n';
  const r = build(semantic);
  assert.deepEqual(codes(r).sort(), ["E_DUP", "E_UNKNOWN_REF"]);
  // avec une erreur de syntaxe en plus, seule la syntaxe est signalée (pas d'erreurs en cascade)
  assert.deepEqual(codes(build(semantic + "  boutton z\n")), ["E_UNKNOWN_KEYWORD"]);
});

test("tabulation et indentation incorrecte sont refusées", () => {
  assert.ok(codes(build('langue français\n\napplication "A"\n\tversion 1.0\n')).includes("E_TAB"));
  assert.ok(codes(build('langue français\n\napplication "A"\n   version 1.0\n')).includes("E_INDENT"));
  assert.ok(codes(build('langue français\n\napplication "A"\n      version 1.0\n')).includes("E_INDENT"));
});

test("les règles sont explicitement « pas encore pris en charge »", () => {
  const r = build('langue français\n\napplication "A"\n\nrègle Alerte\n  quand la quantité est inférieure à 5\n\ninterface X\n');
  assert.ok(codes(r).includes("E_NOT_YET"));
});

test("les commentaires, guillemets français et apostrophes sont acceptés", () => {
  const r = build('langue français\n// commentaire\napplication « Mon appli »\n\ninterface Accueil // fin de ligne\n  étiquette t "L’été"\n');
  assert.ok(r.ok, JSON.stringify(r.diagnostics));
  assert.equal(r.project.name, "Mon appli");
  assert.equal(r.project.widgets[0].text, "L’été");
});

/* ───────── Excel ───────── */

test("application Excel : mode, cibles et liaisons de cellules", () => {
  for (const [file, lang] of [["ventes-excel.fr.bk", "fr"], ["sales-excel.en.bk", "en"]]) {
    const r = build(example(file));
    assert.ok(r.ok, JSON.stringify(r.diagnostics));
    assert.equal(r.language, lang);
    assert.equal(r.project.mode, "excel");
    assert.ok(r.project.targets.includes("excel"));
    const bound = r.project.widgets.filter((w) => w.excelBinding);
    assert.ok(bound.length >= 3);
    assert.equal(bound[0].excelBinding.address, "B2");
    assert.ok(r.project.widgets.some((w) => w.buttonAction?.type === "excel-read"));
  }
});

test("les actions Excel sont refusées hors application Excel ou sans cellule liée", () => {
  const notExcel = build('langue français\n\napplication "A"\n\ninterface X\n  bouton b "B"\n    quand on clique : lire excel\n');
  assert.ok(codes(notExcel).includes("E_EXCEL_ONLY"));
  const noCell = build('langue français\n\napplication "A"\n  type excel\n\ninterface X\n  bouton b "B"\n    quand on clique : lire excel\n');
  assert.ok(codes(noCell).includes("E_EXCEL_CELL"));
  assert.ok(codes(build('langue français\n\napplication "A"\n  type excel\n\ninterface X\n  champ c "C"\n    cellule ZZZZ9\n')).includes("E_BAD_CELL"));
});

/* ───────── Sortie : conformité au Studio et au Bridge ───────── */

test("le projet généré est accepté par le Studio (parseProject) sans perte de structure", async (t) => {
  const studio = new URL("../../studio/src/model/project.ts", import.meta.url);
  if (!existsSync(studio)) return t.skip("dossier studio absent");
  const { parseProject } = await import(studio.href);
  for (const file of ["stock.fr.bk", "ventes-excel.fr.bk", "sales-excel.en.bk"]) {
    const r = build(example(file));
    const parsed = parseProject(JSON.parse(JSON.stringify(r.project)));
    assert.ok(parsed.ok, `${file}: ${parsed.error}`);
    assert.equal(parsed.project.interfaces.length, r.project.interfaces.length);
    assert.equal(parsed.project.widgets.length, r.project.widgets.length);
    assert.equal(parsed.project.mode, r.project.mode);
    for (const [i, iface] of r.project.interfaces.entries()) {
      assert.equal(parsed.project.interfaces[i].id, iface.id);
      assert.deepEqual(parsed.project.interfaces[i].widgets.map((w) => w.id), iface.widgets.map((w) => w.id));
      assert.deepEqual(parsed.project.interfaces[i].widgets.map((w) => w.buttonAction?.type), iface.widgets.map((w) => w.buttonAction?.type));
    }
  }
});

test("le projet généré est accepté par le Bridge et produit un projet Flutter", async (t) => {
  const gen = new URL("../../bridge/generator.mjs", import.meta.url);
  if (!existsSync(gen)) return t.skip("dossier bridge absent");
  const { analyzeProject, generateFlutterProject } = await import(gen.href);
  const project = build(example("stock.fr.bk")).project;
  const analysis = analyzeProject(project);
  assert.ok(analysis.ok, JSON.stringify(analysis.errors));
  const dir = mkdtempSync(join(tmpdir(), "bk-flutter-"));
  try {
    await generateFlutterProject(project, dir);
    assert.ok(existsSync(join(dir, "pubspec.yaml")));
    const dart = readFileSync(join(dir, "lib", "main.dart"), "utf8");
    // le générateur lit toutes les interfaces : les noms et textes écrits dans le .bk doivent s'y retrouver
    for (const text of ["Formulaire produit", "Ajouter un produit", "Produits en stock", "Nom du produit", "Enregistrer"]) {
      assert.ok(dart.includes(text), `« ${text} » absent du main.dart généré`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("mise en page automatique : rien ne se chevauche et tout reste dans l'interface", () => {
  const r = build(example("stock.fr.bk"));
  for (const iface of r.project.interfaces) {
    const free = iface.widgets.filter((w) => w.type !== "panel");
    for (const w of iface.widgets) {
      assert.ok(w.x >= 0 && w.y >= 0 && w.x + w.width <= iface.canvas.width && w.y + w.height <= iface.canvas.height, `${w.name} hors interface`);
    }
    for (let a = 0; a < free.length; a++) for (let b = a + 1; b < free.length; b++) {
      const p = free[a], q = free[b];
      const overlap = p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height && q.y < p.y + p.height;
      assert.ok(!overlap, `${p.name} chevauche ${q.name}`);
    }
  }
});

test("édition Free : le tableau est refusé", () => {
  assert.ok(codes(build(example("stock.fr.bk").replace("édition pro", "édition free"))).includes("E_EDITION"));
});

/* ───────── Ligne de commande ───────── */

function cli(args, home) {
  process.env.BERKIOS_HOME = home;
  const out = [], err = [];
  const code = run(args, { out: (s) => out.push(s), err: (s) => err.push(s) });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

test("CLI : --lg configure, refuse de changer sans -m, -m bascule", () => {
  const home = mkdtempSync(join(tmpdir(), "bk-home-"));
  try {
    assert.equal(cli(["--lg", "--fr"], home).code, 0);
    assert.match(cli(["--lg"], home).out, /français/);
    const refused = cli(["--lg", "--en"], home);
    assert.equal(refused.code, 1);
    assert.match(refused.err, /-m --lg --en/);
    assert.equal(cli(["-m", "--lg", "--en"], home).code, 0);
    assert.match(cli(["--lg"], home).out, /English/);
    assert.equal(cli(["--lg", "--xx"], home).code, 1);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("CLI : « nouveau » crée un fichier valide dans la langue configurée, jamais mélangé", () => {
  const home = mkdtempSync(join(tmpdir(), "bk-home-"));
  const work = mkdtempSync(join(tmpdir(), "bk-work-"));
  try {
    for (const lang of ["fr", "en"]) {
      cli(["-m", "--lg", `--${lang}`], home);
      cli(["--lg", `--${lang}`], home);
      const file = join(work, `main.${lang}.bk`);
      assert.equal(cli(["new", file], home).code, 0, lang);
      assert.equal(cli(["validate", file], home).code, 0, lang);
      const text = readFileSync(file, "utf8");
      assert.match(text, lang === "fr" ? /^langue français/ : /^language english/);
      assert.equal(cli(["compile", file, "-o", join(work, `${lang}.json`)], home).code, 0);
    }
  } finally { rmSync(home, { recursive: true, force: true }); rmSync(work, { recursive: true, force: true }); }
});

test("CLI : les commandes existent en français et en anglais", () => {
  const home = mkdtempSync(join(tmpdir(), "bk-home-"));
  const f = fileURLToPath(new URL("../examples/stock.fr.bk", import.meta.url));
  try {
    cli(["--lg", "--fr"], home);
    assert.equal(cli(["valider", f], home).code, 0);
    assert.equal(cli(["validate", f], home).code, 0);
    const t = cli(["traduire", f, "--vers", "en"], home);
    assert.equal(t.code, 0);
    assert.match(t.out, /^language english/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

/* ───────── Régression v0.5.65 : le CLI affichait des noms vides dans les erreurs ───────── */

import { writeFileSync } from "node:fs";

test("berkios valider affiche le nom fautif dans le message d'erreur", () => {
  const dir = mkdtempSync(join(tmpdir(), "bk-diag-"));
  try {
    const file = join(dir, "erreur.bk");
    writeFileSync(file, 'langue français\n\napplication "T"\n  type interface\n\ninterface A\n  bouton b "Ok"\n    quand on clique : ouvrir Inconnue\n', "utf8");
    const out = [], err = [];
    const code = run(["valider", file], { out: (s) => out.push(s), err: (s) => err.push(s) });
    assert.notEqual(code, 0);
    const text = err.join("\n");
    assert.match(text, /interface introuvable : « Inconnue »/);
    assert.doesNotMatch(text, /«\s+»/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("les diagnostics publiés conservent leurs paramètres", () => {
  const r = compile('langue français\n\napplication "T"\n  type interface\n\ninterface A\n  bouton b "Ok"\n    quand on clique : ouvrir Inconnue\n');
  assert.equal(r.ok, false);
  assert.equal(r.diagnostics[0].params.name, "Inconnue");
});
