// Terrain de jeu BERKIOS CODE : écrire, compiler et exécuter dans le navigateur, sans rien installer.
import { compile, formatDiagnostic, translate, runCli, parseCore, checkCore, runCore, availableLanguages, getLexicon } from "../src/browser.mjs";
import { mountApp } from "./berkios-web.mjs";
import { EXAMPLES } from "./examples-data.mjs";

const UI = {
  fr: { example: "Exemple", translate: "Traduire en", share: "Copier le lien", copied: "Lien copié", dlBk: "Télécharger .bk", dlJson: "Télécharger .berkios.json", tabPreview: "Aperçu", tabConsole: "Console", tabJson: "JSON", run: "Exécuter", help: "Aide",
    ok: "Compilation réussie.", okCore: "BERKIOS Core : programme valide.", errors: "{n} erreur(s).", warnings: "{n} avertissement(s)", none: "Choisir…", translateFail: "Traduction refusée : ",
    cliHint: "Application en ligne de commande : saisissez les arguments puis « Exécuter ».", exit: "[code de sortie : {code}]", emptyPreview: "L'aperçu apparaît ici dès que le code est valide.", coreRunning: "Exécution de BERKIOS Core", runError: "Erreur d'exécution : " },
  en: { example: "Example", translate: "Translate to", share: "Copy link", copied: "Link copied", dlBk: "Download .bk", dlJson: "Download .berkios.json", tabPreview: "Preview", tabConsole: "Console", tabJson: "JSON", run: "Run", help: "Help",
    ok: "Compiled successfully.", okCore: "BERKIOS Core: valid program.", errors: "{n} error(s).", warnings: "{n} warning(s)", none: "Choose…", translateFail: "Translation refused: ",
    cliHint: "Command-line application: type the arguments, then “Run”.", exit: "[exit code: {code}]", emptyPreview: "The preview appears here as soon as the code is valid.", coreRunning: "Running BERKIOS Core", runError: "Runtime error: " },
};
let lang = (new URLSearchParams(location.search).get("lang") || navigator.language || "fr").toLowerCase().startsWith("fr") ? "fr" : "en";
const t = (k, p = {}) => String(UI[lang][k] ?? k).replace(/\{(\w+)\}/g, (_, x) => p[x]);
const $ = (id) => document.getElementById(id);
const code = $("code"), statusEl = $("status"), diagsEl = $("diags"), appEl = $("app"), outEl = $("out"), jsonEl = $("json"), cliForm = $("cli"), cliArgs = $("cli-args");

const stripAccents = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const LANGUAGE_WORDS = new Set(availableLanguages().flatMap((c) => (getLexicon(c).raw.words.LANGUAGE ?? []).map(stripAccents)));
/** Un fichier .bk commence par la déclaration de langue (« langue français », « language english »…) ; sinon c'est du BERKIOS Core. */
function detectKind(source) {
  const first = source.split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("//") && !l.startsWith("#"));
  return first && LANGUAGE_WORDS.has(stripAccents(first.split(/\s+/)[0])) ? "bk" : "bks";
}

let mounted = null, lastProject = null, lastKey = "", cliIr = null, timer = 0;

function setTab(name) {
  for (const id of ["preview", "console", "json"]) {
    $(`tab-${id}`).setAttribute("aria-selected", String(id === name));
    $(`panel-${id}`).hidden = id !== name;
  }
}
for (const id of ["preview", "console", "json"]) $(`tab-${id}`).addEventListener("click", () => setTab(id));

function splitArgs(line) {
  const out = []; let cur = "", q = null, has = false;
  for (const ch of line) {
    if (q) { if (ch === q) q = null; else cur += ch; }
    else if (ch === '"' || ch === "'") { q = ch; has = true; }
    else if (/\s/.test(ch)) { if (cur || has) out.push(cur); cur = ""; has = false; }
    else cur += ch;
  }
  if (cur || has) out.push(cur);
  return out;
}

function runCliOnce(argv) {
  const lines = [];
  const io = { out: (s) => lines.push(String(s)), err: (s) => lines.push(String(s)) };
  const exit = runCli(cliIr, argv, io);
  outEl.textContent = lines.join("\n") + (exit ? `\n${t("exit", { code: exit })}` : "");
}

function showDiagnostics(list, lex, kind) {
  diagsEl.replaceChildren();
  for (const d of list) {
    const li = document.createElement("li");
    if (d.severity !== "error") li.className = "warn";
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = kind === "bk" ? formatDiagnostic(d, lex, "") .replace(/^:/, "") : d.message;
    b.addEventListener("click", () => {
      const lines = code.value.split("\n");
      const start = lines.slice(0, Math.max(0, (d.line ?? 1) - 1)).reduce((n, l) => n + l.length + 1, 0);
      code.focus(); code.setSelectionRange(start, start + (lines[(d.line ?? 1) - 1] ?? "").length);
    });
    li.append(b); diagsEl.append(li);
  }
}

function setStatus(text, cls = "") { statusEl.textContent = text; statusEl.className = `pg-status ${cls}`; }
function clearPreview(message) {
  mounted?.destroy(); mounted = null; lastKey = "";
  appEl.replaceChildren();
  if (message) { const p = document.createElement("p"); p.className = "pg-empty"; p.textContent = message; appEl.append(p); }
}

function update() {
  const source = code.value;
  const kind = detectKind(source);
  $("dl-json").hidden = true; lastProject = null; cliIr = null; cliForm.hidden = true;
  if (kind === "bks") { updateCore(source); return; }
  const result = compile(source);
  showDiagnostics(result.diagnostics, result.lexicon, "bk");
  const errors = result.diagnostics.filter((d) => d.severity === "error").length;
  const warns = result.diagnostics.length - errors;
  if (!result.ok) {
    setStatus(t("errors", { n: errors }), "bad");
    jsonEl.textContent = "";
    if (!mounted) clearPreview(t("emptyPreview"));
    return;
  }
  setStatus(t("ok") + (warns ? ` ${t("warnings", { n: warns })}.` : ""), "ok");
  if (result.project) {
    lastProject = result.project; $("dl-json").hidden = false;
    jsonEl.textContent = JSON.stringify(result.project, null, 2);
    const key = JSON.stringify(result.project);
    if (key !== lastKey) { mounted?.destroy(); lastKey = key; mounted = mountApp(appEl, result.project, { storage: null, toolbar: true }); }
    if ($("tab-console").getAttribute("aria-selected") === "true") setTab("preview");
  } else if (result.cli) {
    clearPreview(""); cliIr = result.cli; cliForm.hidden = false;
    jsonEl.textContent = JSON.stringify(result.cli, null, 2);
    outEl.textContent = t("cliHint");
    setTab("console");
  }
}

function updateCore(source) {
  clearPreview(""); jsonEl.textContent = "";
  const lines = [];
  try {
    const program = parseCore(source, { filename: "main.bks" });
    checkCore(program);
    runCore(program, { out: (s) => lines.push(String(s)) });
    diagsEl.replaceChildren();
    setStatus(t("okCore"), "ok");
    outEl.textContent = lines.join("\n");
  } catch (e) {
    diagsEl.replaceChildren();
    const li = document.createElement("li"), b = document.createElement("button");
    b.type = "button"; b.textContent = String(e?.message ?? e); li.append(b); diagsEl.append(li);
    setStatus(t("errors", { n: 1 }), "bad");
    outEl.textContent = lines.join("\n");
  }
  setTab("console");
}

function schedule() { clearTimeout(timer); timer = setTimeout(update, 350); }
code.addEventListener("input", schedule);
code.addEventListener("keydown", (e) => {
  if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
    e.preventDefault();
    const s = code.selectionStart;
    code.setRangeText("  ", s, code.selectionEnd, "end");
    schedule();
  }
});
cliForm.addEventListener("submit", (e) => { e.preventDefault(); if (cliIr) runCliOnce(splitArgs(cliArgs.value)); });
$("cli-help").addEventListener("click", () => { if (cliIr) runCliOnce([cliIr.sourceLanguage === "fr" ? "--aide" : "--help"]); });

/* ───── exemples, traduction, partage, téléchargement ───── */
function fillSelects() {
  const ex = $("examples"); ex.replaceChildren(new Option(t("none"), ""));
  for (const e of EXAMPLES) ex.append(new Option(e.title[lang] ?? e.title.en, e.id));
  const tr = $("translate"); tr.replaceChildren(new Option(t("none"), ""));
  for (const c of availableLanguages()) tr.append(new Option(getLexicon(c).raw.name ?? c, c));
  for (const node of document.querySelectorAll("[data-i18n]")) node.textContent = t(node.dataset.i18n);
  document.documentElement.lang = lang; $("lang").textContent = lang === "fr" ? "EN" : "FR";
}
function load(source) { code.value = source; clearTimeout(timer); update(); }
$("examples").addEventListener("change", (e) => { const ex = EXAMPLES.find((x) => x.id === e.target.value); if (ex) { load(ex.source); history.replaceState(null, "", location.pathname + location.search); } });
$("translate").addEventListener("change", (e) => {
  const to = e.target.value; e.target.value = "";
  if (!to || detectKind(code.value) !== "bk") return;
  const r = translate(code.value, to);
  if (r.ok) load(r.text); else setStatus(t("translateFail") + (r.diagnostics[0]?.message ?? ""), "bad");
});
const toB64 = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64 = (b) => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));
$("share").addEventListener("click", async () => {
  const url = `${location.origin}${location.pathname}${location.search}#code=${toB64(code.value)}`;
  history.replaceState(null, "", url);
  try { await navigator.clipboard.writeText(url); setStatus(t("copied"), "ok"); } catch { setStatus(url, ""); }
});
function download(name, text, type) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$("dl-bk").addEventListener("click", () => download(detectKind(code.value) === "bk" ? "main.bk" : "main.bks", code.value, "text/plain;charset=utf-8"));
$("dl-json").addEventListener("click", () => { if (lastProject) download("app.berkios.json", JSON.stringify(lastProject, null, 2) + "\n", "application/json"); });
$("lang").addEventListener("click", () => { lang = lang === "fr" ? "en" : "fr"; fillSelects(); update(); });

fillSelects();
let initial = EXAMPLES[0].source;
const m = /^#code=([\w-]+)$/.exec(location.hash);
if (m) { try { initial = fromB64(m[1]); } catch { /* lien invalide : on garde l'exemple */ } }
if (!m) $("examples").value = EXAMPLES[0].id;
load(initial);
