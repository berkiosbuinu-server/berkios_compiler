import { existsSync, readFileSync, writeFileSync, mkdirSync, cpSync } from "node:fs";
import { basename, extname, resolve, join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { compile, formatDiagnostic } from "./compile.mjs";
import { translate, printAst } from "./printer.mjs";
import { runCli } from "./runtime.mjs";
import { exportScript } from "./export.mjs";
import { availableLanguages, getLexicon } from "./lexicon.mjs";
import { readConfig, writeConfig } from "./config.mjs";
import { parseCore, checkCore, runCore } from "./core-language.mjs";

const VERSION = "0.8.0";

/* Messages de l'outil lui-même (distincts des messages du compilateur, qui suivent la langue du fichier). */
const UI = {
  fr: {
    help: `BERKIOS — compilateur BERKIOS CODE (.bk) v${VERSION}

Langue de programmation :
  berkios --lg --fr           choisit le français (première configuration)
  berkios -m --lg --en        change de langue (ici : anglais)
  berkios --lg                affiche la langue actuelle

Commandes :
  berkios nouveau <fichier.bk> [--type commande]   crée un fichier de départ dans votre langue
  berkios installer <nom_bibliothèque>              installe une bibliothèque locale (ex. temps)
  berkios valider <fichier.bk>                     vérifie le fichier sans rien écrire
  berkios compiler <fichier.bk> [-o sortie.json]   produit le projet BERKIOS (.berkios.json)
  berkios traduire <fichier.bk> --vers <fr|en> [-o sortie.bk]
  berkios apercu <fichier.bk> [--port N] [--sans-ouvrir]   affiche l'application dans le navigateur (rechargement automatique)

Applications en ligne de commande (type commande) :
  berkios lancer <fichier.bk> [commande] [arguments]   exécute l'application directement
  berkios exporter <fichier.bk> [-o app.mjs]           crée un script Node.js autonome
  berkios core <fichier.bks> [--project projet.berkios.json]  vérifie avec la langue du projet

Règle : un fichier = une seule langue. Les commentaires ne sont pas conservés par « traduire ».`,
    langSet: "Langue de programmation : {lang}.", langNone: "Aucune langue configurée. Exemple : berkios --lg --fr",
    langCurrent: "Langue de programmation actuelle : {lang}.", langSame: "La langue de programmation est déjà {lang}.",
    langLocked: "La langue est déjà configurée ({lang}). Pour la changer : berkios -m --lg --{code}",
    langUnknown: "Langue « {code} » non disponible. Langues disponibles : {available}.",
    needLang: "Aucune langue configurée. Exécutez d’abord : berkios --lg --fr  (ou --en)",
    noFile: "Fichier introuvable : {file}", exists: "Le fichier existe déjà : {file}", usage: "Usage : berkios {cmd} <fichier.bk>",
    unknownCmd: "Commande inconnue : {cmd}. Voir : berkios --aide",
    created: "Fichier créé : {file}", ok: "OK — {file} est valide ({w} avertissement(s)).",
    written: "Écrit : {file}", failed: "Échec : {n} erreur(s).", needTarget: "Indiquez la langue cible : --vers fr  ou  --vers en",
    notCli: "Ce fichier n’est pas une application de type commande (voir : berkios nouveau x.bk --type commande).", notCliOnly: "Cette commande ne s’applique qu’aux applications de type commande.", badType: "Type inconnu : « {type} ». Choix : interface, commande.",
    tplCliApp: "Mon outil", tplCmd: "saluer", tplCmdDesc: "Dit bonjour", tplArg: "nom", tplOpt: "répétitions", tplHello: "Bonjour ",
    tplApp: "Ma première application", tplHome: "Accueil", tplTitle: "Bonjour", tplBtn: "Cliquer ici", tplMsg: "Bravo !", tplName: "titre", tplBtnName: "valider",
  },
  en: {
    help: `BERKIOS — BERKIOS CODE (.bk) compiler v${VERSION}

Programming language:
  berkios --lg --en           choose English (first-time setup)
  berkios -m --lg --fr        switch language (here: French)
  berkios --lg                show the current language

Commands:
  berkios new <file.bk> [--type command]           create a starter file in your language
  berkios install <library_name>                    install a local library (e.g. time)
  berkios validate <file.bk>                       check the file without writing anything
  berkios compile <file.bk> [-o output.json]       produce the BERKIOS project (.berkios.json)
  berkios translate <file.bk> --to <fr|en> [-o output.bk]
  berkios preview <file.bk> [--port N] [--no-open]  show the application in the browser (auto-reload)

Command-line applications (type command):
  berkios run <file.bk> [command] [arguments]      run the application directly
  berkios export <file.bk> [-o app.mjs]            create a standalone Node.js script
  berkios core <file.bks>                           check and run BERKIOS Core

Rule: one file = one language. Comments are not kept by « translate ».`,
    langSet: "Programming language: {lang}.", langNone: "No language configured. Example: berkios --lg --en",
    langCurrent: "Current programming language: {lang}.", langSame: "The programming language is already {lang}.",
    langLocked: "The language is already configured ({lang}). To change it: berkios -m --lg --{code}",
    langUnknown: "Language « {code} » is not available. Available languages: {available}.",
    needLang: "No language configured. Run first: berkios --lg --en  (or --fr)",
    noFile: "File not found: {file}", exists: "File already exists: {file}", usage: "Usage: berkios {cmd} <file.bk>",
    unknownCmd: "Unknown command: {cmd}. See: berkios --help",
    created: "File created: {file}", ok: "OK — {file} is valid ({w} warning(s)).",
    written: "Written: {file}", failed: "Failed: {n} error(s).", needTarget: "Give the target language: --to fr  or  --to en",
    notCli: "This file is not an application of type command (see: berkios new x.bk --type command).", notCliOnly: "This command only applies to applications of type command.", badType: "Unknown type: « {type} ». Choices: interface, command.",
    tplCliApp: "My tool", tplCmd: "greet", tplCmdDesc: "Says hello", tplArg: "name", tplOpt: "count", tplHello: "Hello ",
    tplApp: "My first application", tplHome: "Home", tplTitle: "Hello", tplBtn: "Click here", tplMsg: "Well done!", tplName: "title", tplBtnName: "confirm",
  },
};
const COMMANDS = { new: ["nouveau", "new"], validate: ["valider", "validate"], compile: ["compiler", "compile"], translate: ["traduire", "translate"], run: ["lancer", "run"], export: ["exporter", "export"], core: ["core", "exécuter-code", "execute-code"] };
const fmt = (s, p = {}) => s.replace(/\{(\w+)\}/g, (_, k) => String(p[k] ?? ""));

function uiLanguage(config) {
  if (config.language && UI[config.language]) return config.language;
  return /^fr/i.test(process.env.LC_ALL || process.env.LANG || "") ? "fr" : "en";
}

function option(args, names) {
  const i = args.findIndex((a) => names.includes(a));
  return i >= 0 ? args[i + 1] : undefined;
}

/** Point d'entrée testable : renvoie le code de sortie. */
export function run(argv, io = { out: (s) => console.log(s), err: (s) => console.error(s) }) {
  const config = readConfig();
  const t = UI[uiLanguage(config)];
  const say = (key, p) => io.out(fmt(t[key], p));
  const fail = (key, p) => { io.err(fmt(t[key], p)); return 1; };
  const args = [...argv];

  // Gestion des bibliothèques BERKIOS CODE installables localement.
  if (["installer", "install"].includes(args[0])) {
    const name = String(args[1] || "").toLowerCase();
    const libraries = {
      temps: { file: "temps.bklib", source: `# Bibliothèque BERKIOS CODE : temps (v1.0.0)
# Fonctions documentées : date_aujourdhui, heure_actuelle, attendre
# API prévue pour les expressions BERKIOS CODE.
` },
      time: { file: "temps.bklib", source: `# BERKIOS CODE time library (v1.0.0)
# Documented API: today, current_time, wait
` },
    };
    const lib = libraries[name];
    if (!lib) return fail("unknownCmd", { cmd: `installer ${name || "<bibliothèque>"}. Bibliothèques intégrées : temps, time` });
    const dest = join(process.env.BERKIOS_HOME || join(homedir(), ".berkios"), "libraries");
    mkdirSync(dest, { recursive: true });
    const out = join(dest, lib.file);
    writeFileSync(out, lib.source, "utf8");
    io.out(`Bibliothèque « ${name} » installée : ${out}`);
    io.out("Note : le gestionnaire installe le manifeste de bibliothèque. Les fonctions seront utilisables dans le code compilé lorsqu’elles seront prises en charge par la version du compilateur.");
    return 0;
  }
  const isRun = COMMANDS.run.includes(args[0]);
  if (!args.length || (!isRun && args.some((a) => ["--aide", "--help", "-h", "aide", "help"].includes(a)))) { io.out(t.help); return 0; }
  if (!isRun && args.includes("--version")) { io.out(VERSION); return 0; }

  /* ── langue de programmation : --lg --fr  /  -m --lg --en ── */
  if (!isRun && args.includes("--lg")) {
    const modify = args.includes("-m");
    const lgAt = args.indexOf("--lg");
    const code = (args.find((a) => /^--[a-z]{2}$/.test(a) && a !== "--lg") ?? (args[lgAt + 1] && !args[lgAt + 1].startsWith("-") ? `--${args[lgAt + 1]}` : ""))?.slice(2);
    if (!code) {
      if (!config.language) { say("langNone"); return 0; }
      say("langCurrent", { lang: getLexicon(config.language)?.msg("LANG_OF") ?? config.language }); return 0;
    }
    const lex = getLexicon(code);
    if (!lex) return fail("langUnknown", { code, available: availableLanguages().join(", ") });
    if (config.language === code) { say("langSame", { lang: lex.msg("LANG_OF") }); return 0; }
    if (config.language && !modify) return fail("langLocked", { lang: getLexicon(config.language)?.msg("LANG_OF") ?? config.language, code });
    writeConfig({ ...config, language: code });
    io.out(fmt(UI[code]?.langSet ?? t.langSet, { lang: lex.msg("LANG_OF") }));
    return 0;
  }

  const [cmdWord, ...rest] = args;
  const cmd = Object.keys(COMMANDS).find((k) => COMMANDS[k].includes(cmdWord));
  if (!cmd) return fail("unknownCmd", { cmd: cmdWord });
  const file = cmd === "run" ? rest[0] : rest.find((a, i) => !a.startsWith("-") && !["-o", "--vers", "--to", "--type"].includes(rest[i - 1]));
  if (!file || (cmd === "run" && file.startsWith("-"))) return fail("usage", { cmd: cmdWord });
  const path = resolve(file);

  if (cmd === "core") {
    if (!existsSync(path)) return fail("noFile", { file });
    try {
      const projectPath = option(rest, ["--project"]);
      let coreLanguage;
      if (projectPath) {
        const resolvedProjectPath = resolve(projectPath);
        if (!existsSync(resolvedProjectPath)) return fail("noFile", { file: projectPath });
        let projectConfig;
        try { projectConfig = JSON.parse(readFileSync(resolvedProjectPath, "utf8")); }
        catch { io.err(`Configuration de projet JSON invalide : ${projectPath}`); return 1; }
        coreLanguage = projectConfig?.codeLanguage;
        if (!coreLanguage) { io.err(`Le projet ${projectPath} ne définit pas « codeLanguage ». Choisissez fr, en, es ou sw dans les propriétés du projet.`); return 1; }
      }
      const program = parseCore(readFileSync(path, "utf8"), {
        language: coreLanguage,
        filename: path,
        resolveImport: (specifier, from) => {
          const candidate = resolve(dirname(from || path), specifier);
          if (!existsSync(candidate)) return null;
          return { filename: candidate, source: readFileSync(candidate, "utf8") };
        },
      });
      const checked = checkCore(program);
      io.out(`BERKIOS Core : ${program.module} — ${checked.functions} fonction(s), ${checked.types} type(s) : vérification réussie.`);
      const code = runCore(program, { out: (value) => io.out(value) });
      return Number.isInteger(code) ? code : 0;
    } catch (e) {
      io.err(`${file}:${e.line ?? 1}:${e.col ?? 1} ${e.code ?? "E_CORE_RUNTIME"} : ${e.message}`);
      return 1;
    }
  }

  if (cmd === "new") {
    if (!config.language) return fail("needLang");
    if (existsSync(path)) return fail("exists", { file });
    const lex = getLexicon(config.language);
    const kind = option(rest, ["--type"]) ?? "interface";
    if (!["interface", "commande", "command"].includes(kind)) return fail("badType", { type: kind });
    const ast = ["commande", "command"].includes(kind) ? {
      language: lex.code,
      applications: [{ name: t.tplCliApp, version: "1.0", appType: "TYPE_COMMAND", author: "", description: "", platforms: null, edition: "pro" }],
      models: [], interfaces: [],
      commands: [{
        name: t.tplCmd, description: t.tplCmdDesc,
        params: [{ kind: "argument", name: t.tplArg, type: "T_TEXT", required: true }, { kind: "option", name: t.tplOpt, type: "T_INT", default: 1 }],
        action: [{ k: "repeat", n: { k: "ref", name: t.tplOpt }, body: [{ k: "print", e: { k: "cat", parts: [{ k: "str", v: t.tplHello }, { k: "ref", name: t.tplArg }] } }] }],
      }],
    } : {
      language: lex.code,
      applications: [{ name: t.tplApp, version: "1.0", appType: "TYPE_INTERFACE", author: "", description: "", platforms: null, edition: "pro" }],
      models: [], commands: [],
      interfaces: [{ name: t.tplHome, items: [
        { kind: "label", name: t.tplName, text: t.tplTitle, children: [], textSize: 26, bold: true },
        { kind: "button", name: t.tplBtnName, text: t.tplBtn, children: [], onClick: { type: "A_MESSAGE", message: t.tplMsg } },
      ] }],
    };
    writeFileSync(path, printAst(ast, lex), "utf8");
    say("created", { file });
    return 0;
  }

  if (!existsSync(path)) return fail("noFile", { file });
  const source = readFileSync(path, "utf8");
  const options = { language: config.language, messagesLanguage: config.language };

  if (cmd === "translate") {
    const target = option(rest, ["--vers", "--to"]);
    if (!target) return fail("needTarget");
    if (!getLexicon(target)) return fail("langUnknown", { code: target, available: availableLanguages().join(", ") });
    const r = translate(source, target, options);
    if (!r.ok) {
      for (const d of r.diagnostics) io.err(`${file}:${d.line}:${d.col} ${d.severity} : ${d.message}`);
      return 1;
    }
    const out = option(rest, ["-o"]);
    if (out) { writeFileSync(resolve(out), r.text, "utf8"); say("written", { file: out }); } else io.out(r.text.trimEnd());
    return 0;
  }

  const r = compile(source, options);
  if (cmd === "run" && r.ok && !r.cli) return fail("notCli");
  if (cmd === "export" && r.ok && !r.cli) return fail("notCliOnly");
  for (const d of r.diagnostics) (d.severity === "error" ? io.err : io.out)(formatDiagnostic(d, r.lexicon, file));
  const errors = r.diagnostics.filter((d) => d.severity === "error").length;
  if (!r.ok) return fail("failed", { n: errors });
  if (cmd === "validate") { say("ok", { file, w: r.diagnostics.length }); return 0; }
  if (cmd === "run") return runCli(r.cli, rest.slice(1), io);
  const base = basename(file, extname(file));
  if (cmd === "export") {
    const out = option(rest, ["-o"]) ?? `${base}.mjs`;
    writeFileSync(resolve(out), exportScript(r.cli), "utf8");
    say("written", { file: out });
    return 0;
  }
  const out = option(rest, ["-o"]) ?? (r.cli ? `${base}.berkios-cli.json` : `${base}.berkios.json`);
  writeFileSync(resolve(out), JSON.stringify(r.cli ?? r.project, null, 2) + "\n", "utf8");
  say("written", { file: out });
  return 0;
}
