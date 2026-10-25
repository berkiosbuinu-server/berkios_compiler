import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { run as runCli } from "../src/cli.mjs";
import { parseCore, checkCore, runCore } from "../src/core-language.mjs";

const example = readFileSync(new URL("../examples/core/industrial.bks", import.meta.url), "utf8");

test("BERKIOS Core parses and statically checks typed functions and declared data types", () => {
  const program = parseCore(example);
  assert.equal(program.functions.length, 2);
  assert.equal(program.types[0].name, "SensorReading");
  assert.deepEqual(checkCore(program), { ok: true, functions: 2, types: 1 });
});

test("BERKIOS Core executes functions, typed lists, built-ins, and recoverable errors", () => {
  const output = [];
  const code = runCore(parseCore(example), { out: (value) => output.push(value) });
  assert.equal(code, 0);
  assert.deepEqual(output, ["Average temperature: 21.8", "Recoverable fault: Sensor calibration unavailable"]);
});

test("BERKIOS Core rejects an undeclared variable before execution", () => {
  const src = `module "Bad"\nfn main() -> Int\n  print missing\n  return 0\n`;
  assert.throws(() => checkCore(parseCore(src)), /Unknown variable 'missing'/);
});

test("BERKIOS Core rejects incompatible typed assignments", () => {
  const src = `module "Bad"\nfn main() -> Int\n  let count: Int = "not a number"\n  return 0\n`;
  assert.throws(() => checkCore(parseCore(src)), /expects Int, got Text/);
});

test("BERKIOS Core catches a division-by-zero runtime error", () => {
  const src = `module "Safe"\nfn main() -> Int\n  try\n    let value: Int = 10 / 0\n  catch fault\n    print fault\n  return 0\n`;
  const output = [];
  assert.equal(runCore(parseCore(src), { out: (value) => output.push(value) }), 0);
  assert.deepEqual(output, ["Division by zero"]);
});


test("BERKIOS Core enforces the recursion safety limit", () => {
  const src = `module "Recursive"\nfn loop(n: Int) -> Int\n  return loop(n + 1)\nfn main() -> Int\n  return loop(0)\n`;
  assert.throws(() => runCore(parseCore(src), { out: () => {}, maxDepth: 12 }), /Maximum call depth exceeded/);
});

test("BERKIOS Core accepts declared record types and rejects unknown types", () => {
  const good = `module "Records"\ntype Sensor\n  id: Text\nfn inspect(sensor: Sensor) -> Void\n  print "sensor received"\nfn main() -> Int\n  return 0\n`;
  assert.equal(checkCore(parseCore(good)).types, 1);
  const bad = `module "Records"\nfn main() -> UnknownRecord\n  return 0\n`;
  assert.throws(() => checkCore(parseCore(bad)), /Unknown type 'UnknownRecord'/);
});

test("BERKIOS Core accepts equivalent French, English, Spanish, and Swahili syntax", () => {
  const programs = [
    `module "Mesures"\nfonction moyenne(valeurs: Liste<Decimal>) -> Decimal\n  soit total = somme(valeurs)\n  retourner total / longueur(valeurs)\nfonction principale() -> Entier\n  soit mesures = [21.4, 22.1, 21.9]\n  afficher moyenne(mesures)\n  retourner 0\n`,
    `module "Measurements"\nfn average(values: List<Decimal>) -> Decimal\n  let total = sum(values)\n  return total / len(values)\nfn main() -> Int\n  let readings = [21.4, 22.1, 21.9]\n  print average(readings)\n  return 0\n`,
    `modulo "Mediciones"\nfuncion promedio(valores: Lista<Decimal>) -> Decimal\n  sea total = suma(valores)\n  retornar total / longitud(valores)\nfuncion principal() -> Entero\n  sea mediciones = [21.4, 22.1, 21.9]\n  mostrar promedio(mediciones)\n  retornar 0\n`,
    `moduli "Vipimo"\nkazi wastani(thamani: Orodha<Desimali>) -> Desimali\n  acha jumla = jumlisha(thamani)\n  rudisha jumla / urefu(thamani)\nkazi kuu() -> Nambari\n  acha vipimo = [21.4, 22.1, 21.9]\n  onyesha wastani(vipimo)\n  rudisha 0\n`
  ];
  for (const source of programs) {
    const output = [];
    const program = parseCore(source);
    assert.equal(checkCore(program).ok, true);
    assert.equal(runCore(program, { out: (value) => output.push(value) }), 0);
    assert.equal(output.length, 1);
    assert.ok(Math.abs(Number(output[0]) - 21.8) < 1e-9);
  }
});

test("BERKIOS Core applique la langue configurée et refuse les mots-clés étrangers", () => {
  const french = `module "Mesures"\nfonction principale() -> Entier\n  soit total = 1\n  retourner total\n`;
  assert.equal(parseCore(french, { language: "fr" }).language, "fr");
  assert.throws(() => parseCore(french, { language: "en" }), { code: "E_CORE_LANGUAGE_MISMATCH" });
  const spanish = `modulo "Mediciones"\nfunción principal() -> Entero\n  sea total = 1\n  retornar total\n`;
  assert.equal(parseCore(spanish, { language: "es" }).functions.length, 1);
  assert.throws(() => parseCore(spanish, { language: "sw" }), { code: "E_CORE_LANGUAGE_MISMATCH" });
});

test("BERKIOS Core signale une langue de projet non prise en charge", () => {
  assert.throws(() => parseCore(`fn main() -> Int\n  return 0\n`, { language: "pt" }), { code: "E_CORE_LANGUAGE" });
});


test("la commande Core applique codeLanguage depuis le fichier projet", () => {
  const dir = mkdtempSync(join(tmpdir(), "berkios-core-project-"));
  try {
    const sourcePath = join(dir, "main.bks");
    const projectPath = join(dir, "app.berkios.json");
    writeFileSync(sourcePath, `modulo "Mediciones"\nfuncion principal() -> Entero\n  sea total = 0\n  retornar total\n`, "utf8");
    writeFileSync(projectPath, JSON.stringify({ schemaVersion: "1.3", name: "Proyecto", codeLanguage: "es", widgets: [] }), "utf8");
    const out = [], err = [];
    assert.equal(runCli(["core", sourcePath, "--project", projectPath], { out: (x) => out.push(x), err: (x) => err.push(x) }), 0);
    assert.equal(err.length, 0, err.join("\n"));
    assert.match(out.join("\n"), /vérification réussie/);
    const swProject = join(dir, "sw.berkios.json");
    writeFileSync(swProject, JSON.stringify({ schemaVersion: "1.3", name: "Proyecto", codeLanguage: "sw", widgets: [] }), "utf8");
    const out2 = [], err2 = [];
    assert.equal(runCli(["core", sourcePath, "--project", swProject], { out: (x) => out2.push(x), err: (x) => err2.push(x) }), 1);
    assert.match(err2.join("\n"), /E_CORE_LANGUAGE_MISMATCH/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("BERKIOS Core complet: fonctions, types localisés, conditions, listes, calculs et exceptions dans les quatre langues", () => {
  const dir = fileURLToPath(new URL("../examples/core/multilingual/", import.meta.url));
  const files = readdirSync(dir).filter((name) => name.endsWith(".bks"));
  assert.equal(files.length, 4);
  for (const file of files) {
    const source = readFileSync(join(dir, file), "utf8");
    const language = file.endsWith("-fr.bks") ? "fr" : file.endsWith("-en.bks") ? "en" : file.endsWith("-es.bks") ? "es" : "sw";
    const program = parseCore(source, { language });
    assert.equal(checkCore(program).ok, true, file);
    const output = [];
    assert.equal(runCore(program, { out: (value) => output.push(value) }), 0, file);
    assert.ok(output.some((line) => String(line).includes("37.5")), `${file}: total should be 37.5`);
    assert.ok(output.some((line) => String(line).includes("60")), `${file}: list sum should be 60`);
    assert.ok(output.some((line) => String(line) === "0") && output.some((line) => String(line) === "1"), `${file}: localized while loop should run twice`);
    assert.ok(output.some((line) => String(line).includes("Division by zero")), `${file}: division error should be caught`);
  }
});


test("BERKIOS Core importe des modules locaux et réutilise leurs fonctions et types", () => {
  const files = {
    "maths.bks": `module \"Maths\"\ntype Mesure\n  valeur: Decimal\nfonction doubler(nombre: Decimal) -> Decimal\n  retourner nombre * 2\n`,
  };
  const source = `module \"Application\"\nimporter \"maths.bks\"\nfonction principale() -> Entier\n  soit resultat = doubler(21)\n  afficher resultat\n  retourner 0\n`;
  const program = parseCore(source, {
    language: "fr", filename: "/projet/main.bks",
    resolveImport: (specifier, from) => files[specifier] ? { filename: "/projet/" + specifier, source: files[specifier] } : null,
  });
  assert.equal(checkCore(program).ok, true);
  assert.equal(program.functions.length, 2);
  assert.equal(program.types.length, 1);
  const output = [];
  assert.equal(runCore(program, { out: (value) => output.push(value) }), 0);
  assert.deepEqual(output, ["42"]);
});

test("BERKIOS Core signale clairement un import introuvable et les cycles", () => {
  assert.throws(() => parseCore(`module \"Main\"\nimport \"missing.bks\"\n`, { resolveImport: () => null }), { code: "E_CORE_IMPORT_NOT_FOUND" });
  const sources = {
    "/p/a.bks": `module \"A\"\nimport \"b.bks\"\n`,
    "/p/b.bks": `module \"B\"\nimport \"a.bks\"\n`,
  };
  assert.throws(() => parseCore(sources["/p/a.bks"], {
    filename: "/p/a.bks",
    resolveImport: (name, from) => { const path = from.replace(/[^/]+$/, name); return sources[path] ? { filename: path, source: sources[path] } : null; },
  }), { code: "E_CORE_IMPORT_CYCLE" });
});

test("BERKIOS Core valide les types génériques déclarés et leurs arguments", () => {
  const declarations = `module "Generiques"\ntype Boite<T>\n  valeur: T\ntype Paire<Cle, Valeur>\n  cle: Cle\n  valeur: Valeur\nfn lire(boite: Boite<Int>) -> Int\n  return 1\nfn main() -> Int\n  return 0\n`;
  // Vérifie les déclarations génériques et leurs signatures sans supposer de constructeur implicite.
  const program = parseCore(declarations);
  assert.equal(checkCore(program).types, 2);
  assert.throws(() => checkCore(parseCore(`module "Bad"\ntype Boite<T>\n  valeur: T\nfn lire(boite: Boite) -> Int\n  return 1\nfn main() -> Int\n  return 0\n`)), /expects 1 type argument/);
  assert.throws(() => checkCore(parseCore(`module "Bad"\ntype Boite<T>\n  valeur: T\nfn lire(boite: Boite<Inconnu>) -> Int\n  return 1\nfn main() -> Int\n  return 0\n`)), /Unknown type 'Inconnu'/);
});

test("BERKIOS Core construit des valeurs typées et vérifie leurs champs", () => {
  const source = `module "Valeurs"\ntype Boite<T>\n  valeur: T\ntype Paire<Cle, Valeur>\n  cle: Cle\n  valeur: Valeur\nfn main() -> Int\n  soit boite: Boite<Int> = Boite(42)\n  soit paire: Paire<Text, Int> = Paire("age", boite.valeur)\n  afficher paire.cle\n  afficher paire.valeur\n  retourner paire.valeur\n`;
  const output = [];
  assert.equal(runCore(parseCore(source), { out: value => output.push(value) }), 42);
  assert.deepEqual(output, ["age", "42"]);
});

test("BERKIOS Core refuse les constructeurs avec un nombre de champs incorrect", () => {
  const source = `module "Bad"\ntype Point\n  x: Int\n  y: Int\nfn main() -> Int\n  soit p = Point(1)\n  retourner 0\n`;
  assert.throws(() => checkCore(parseCore(source)), /Constructor 'Point' expects 2 argument/);
});

test("BERKIOS Core signale un champ inconnu sur une valeur typée", () => {
  const source = `module "Bad"\ntype Point\n  x: Int\nfn lire(p: Point) -> Int\n  retourner p.y\nfn main() -> Int\n  retourner 0\n`;
  assert.throws(() => checkCore(parseCore(source)), /has no field 'y'/);
});


test("BERKIOS Core vérifie les classes et leurs interfaces structurelles", () => {
  const source = `module "Interfaces"\ninterface Identifiable\n  id: Int\n  nom: Text\nclass Personne implements Identifiable\n  id: Int\n  nom: Text\nfn main() -> Int\n  soit p = Personne(7, "Amina")\n  afficher p.nom\n  retourner p.id\n`;
  const program = parseCore(source);
  assert.equal(checkCore(program).types, 1);
  const output = [];
  assert.equal(runCore(program, { out: value => output.push(value) }), 7);
  assert.deepEqual(output, ["Amina"]);
});

test("BERKIOS Core refuse une classe qui ne respecte pas une interface", () => {
  const source = `module "Bad"\ninterface Identifiable\n  id: Int\n  nom: Text\nclass Personne implements Identifiable\n  id: Int\nfn main() -> Int\n  retourner 0\n`;
  assert.throws(() => checkCore(parseCore(source)), { code: "E_CORE_INTERFACE" });
});

test("BERKIOS Core refuse une interface inexistante", () => {
  const source = `module "Bad"\nclass Personne implements Introuvable\n  id: Int\nfn main() -> Int\n  retourner 0\n`;
  assert.throws(() => checkCore(parseCore(source)), /implements unknown interface/);
});


test("BERKIOS Core exécute les méthodes d'instance et modifie les champs de l'objet", () => {
  const source = `module "Comptes"\nclass Compte\n  solde: Int\n  fn deposer(montant: Int) -> Int\n    self.solde = self.solde + montant\n    retourner self.solde\nfn main() -> Int\n  soit compte = Compte(100)\n  afficher compte.deposer(50)\n  afficher compte.solde\n  retourner compte.solde\n`;
  const output = [];
  assert.equal(runCore(parseCore(source), { out: value => output.push(value) }), 150);
  assert.deepEqual(output, ["150", "150"]);
});

test("BERKIOS Core vérifie les arguments et les méthodes inconnues", () => {
  const wrongArgs = `module "Bad"\nclass Compte\n  solde: Int\n  fn deposer(montant: Int) -> Int\n    retourner montant\nfn main() -> Int\n  soit compte = Compte(10)\n  retourner compte.deposer()\n`;
  assert.throws(() => checkCore(parseCore(wrongArgs)), /Method 'deposer' expects 1 argument/);
  const unknown = `module "Bad"\nclass Compte\n  solde: Int\nfn main() -> Int\n  soit compte = Compte(10)\n  retourner compte.fermer()\n`;
  assert.throws(() => checkCore(parseCore(unknown)), /has no method 'fermer'/);
});


test("BERKIOS Core vérifie les méthodes obligatoires des interfaces", () => {
  const source = `module "Services"\ninterface Rechargeable\n  fn recharger(quantite: Int) -> Int\nclass Batterie implements Rechargeable\n  niveau: Int\n  fn recharger(quantite: Int) -> Int\n    self.niveau = self.niveau + quantite\n    retourner self.niveau\nfn main() -> Int\n  soit b = Batterie(10)\n  retourner b.recharger(5)\n`;
  const program = parseCore(source);
  assert.equal(runCore(program), 15);
});

test("BERKIOS Core refuse une classe sans méthode d'interface", () => {
  const source = `module "Bad"\ninterface Rechargeable\n  fn recharger(quantite: Int) -> Int\nclass Batterie implements Rechargeable\n  niveau: Int\nfn main() -> Int\n  retourner 0\n`;
  assert.throws(() => checkCore(parseCore(source)), /does not implement method 'Rechargeable.recharger'/);
});

test("BERKIOS Core refuse une signature de méthode incompatible avec une interface", () => {
  const source = `module "Bad"\ninterface Rechargeable\n  fn recharger(quantite: Int) -> Int\nclass Batterie implements Rechargeable\n  niveau: Int\n  fn recharger(quantite: Text) -> Int\n    retourner 0\nfn main() -> Int\n  retourner 0\n`;
  assert.throws(() => checkCore(parseCore(source)), /parameter 'quantite' expects Int, got Text/);
});

test("BERKIOS Core exécute les fonctions génériques avec inférence de type", () => {
  const source = `module "Generiques"\nfn identite<T>(valeur: T) -> T\n  retourner valeur\nfn premier<T>(valeurs: List<T>) -> T\n  retourner valeurs[0]\nfn main() -> Int\n  soit nombre: Int = identite(42)\n  soit texte: Text = identite("bonjour")\n  afficher texte\n  retourner premier([nombre, 7])\n`;
  const output = [];
  assert.equal(runCore(parseCore(source), { out: value => output.push(value) }), 42);
  assert.deepEqual(output, ["bonjour"]);
});

test("BERKIOS Core refuse des arguments incompatibles pour une fonction générique", () => {
  const source = `module "Bad"\nfn identite<T>(valeur: T) -> T\n  retourner valeur\nfn principal() -> Int\n  retourner identite(1, 2)\nfn main() -> Int\n  retourner identite(1) + identite("texte")\n`;
  assert.throws(() => checkCore(parseCore(source)), /expects 1 argument/);
});

test("BERKIOS Core détecte les types génériques incohérents dans une même fonction", () => {
  const source = `module "Bad"\nfn choisir<T>(a: T, b: T) -> T\n  retourner a\nfn main() -> Int\n  retourner choisir(1, "texte")\n`;
  assert.throws(() => checkCore(parseCore(source)), /consistent types/);
});


test("BERKIOS Core hérite des champs et méthodes, avec redéfinition polymorphe", () => {
  const source = `module "Heritage"\nclass Animal\n  nom: Text\n  fn parler() -> Text\n    retourner "..."\nclass Chien extends Animal\n  race: Text\n  fn parler() -> Text\n    retourner "Wouf"\nfn main() -> Int\n  soit chien = Chien("Rex", "Berger")\n  afficher chien.nom\n  afficher chien.parler()\n  retourner 0\n`;
  const output = [];
  assert.equal(runCore(parseCore(source), { out: value => output.push(value) }), 0);
  assert.deepEqual(output, ["Rex", "Wouf"]);
});

test("BERKIOS Core refuse les cycles et les redéfinitions incompatibles", () => {
  const cycle = `module "Bad"\nclass A extends B\n  x: Int\nclass B extends A\n  y: Int\nfn main() -> Int\n  retourner 0\n`;
  assert.throws(() => checkCore(parseCore(cycle)), { code: "E_CORE_INHERITANCE" });
  const override = `module "Bad"\nclass Base\n  fn valeur(x: Int) -> Int\n    retourner x\nclass Enfant extends Base\n  fn valeur(x: Text) -> Int\n    retourner 0\nfn main() -> Int\n  retourner 0\n`;
  assert.throws(() => checkCore(parseCore(override)), { code: "E_CORE_OVERRIDE" });
});
