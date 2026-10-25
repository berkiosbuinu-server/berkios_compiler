// `berkios apercu <fichier.bk>` : compile le fichier et l'affiche dans le navigateur (serveur local, rechargement automatique).
// Aucune dépendance : modules http/fs de Node.js uniquement. Le serveur n'écoute que sur 127.0.0.1.
import { createServer } from "node:http";
import { readFileSync, statSync, existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { compile, formatDiagnostic } from "./compile.mjs";
import { readConfig } from "./config.mjs";

const WEB_DIR = fileURLToPath(new URL("../web/", import.meta.url));
const WEB_FILES = new Map([
  ["berkios-web.mjs", "text/javascript; charset=utf-8"],
  ["data-store.mjs", "text/javascript; charset=utf-8"],
  ["preview-client.mjs", "text/javascript; charset=utf-8"],
  ["berkios-web.css", "text/css; charset=utf-8"],
]);

const PAGE = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BERKIOS — aperçu</title>
<link rel="stylesheet" href="/web/berkios-web.css">
<style>
  html, body, #app { height: 100%; margin: 0; }
  #errors { position: fixed; inset: 0; background: #fff7f7; color: #7f1d1d; padding: 1.5rem; overflow: auto; font: 14px/1.5 ui-monospace, Consolas, monospace; white-space: pre-wrap; z-index: 50; }
  #errors[hidden] { display: none; }
</style>
</head>
<body>
<div id="app"></div>
<div id="errors" hidden></div>
<script type="module" src="/web/preview-client.mjs"></script>
</body>
</html>
`;

const T = {
  fr: {
    usage: "Usage : berkios apercu <fichier.bk> [--port N] [--sans-ouvrir]", noFile: "Fichier introuvable : {file}", notInterface: "Cette application est de type commande : utilisez « berkios lancer {file} ».",
    failed: "Échec : {n} erreur(s).", listening: "Aperçu de {name} : {url}", stop: "Ctrl+C pour arrêter. Le navigateur se recharge quand vous enregistrez le fichier.", badPort: "Port invalide : {port}",
    openFail: "Ouvrez cette adresse dans votre navigateur.", reloaded: "Rechargé ({time}).",
  },
  en: {
    usage: "Usage: berkios preview <file.bk> [--port N] [--no-open]", noFile: "File not found: {file}", notInterface: "This application is of type command: use “berkios run {file}”.",
    failed: "Failed: {n} error(s).", listening: "Preview of {name}: {url}", stop: "Press Ctrl+C to stop. The browser reloads when you save the file.", badPort: "Invalid port: {port}",
    openFail: "Open this address in your browser.", reloaded: "Reloaded ({time}).",
  },
};
const fmt = (s, p = {}) => s.replace(/\{(\w+)\}/g, (_, k) => String(p[k] ?? ""));

function uiLang() {
  const lang = readConfig().language;
  if (lang && T[lang]) return lang;
  return /^fr/i.test(process.env.LC_ALL || process.env.LANG || "") ? "fr" : "en";
}

/** Compile le fichier et renvoie ce que la page d'aperçu a besoin de savoir. */
export function compileForPreview(file) {
  const source = readFileSync(file, "utf8");
  const result = compile(source);
  const name = basename(file);
  const format = (d) => formatDiagnostic(d, result.lexicon, name);
  const errors = result.diagnostics.filter((d) => d.severity === "error").map(format);
  const warnings = result.diagnostics.filter((d) => d.severity !== "error").map(format);
  return { ok: result.ok && !!result.project, isCli: Boolean(result.cli), project: result.project, errors, warnings, language: result.language };
}

export function openBrowser(url) {
  const [cmd, args] = process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
    return true;
  } catch { return false; }
}

/**
 * Démarre le serveur d'aperçu.
 * @returns {Promise<{ url:string, port:number, close():Promise<void> }>}
 */
export function startPreview({ file, port = 0, open = false, onReload = () => {} }) {
  const path = resolve(file);
  let version = 0;
  let mtime = statSync(path).mtimeMs;
  const clients = new Set();
  let allowedHosts = new Set();

  const server = createServer((req, res) => {
    const headers = {
      "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' http: https:; frame-ancestors 'none'; base-uri 'none'",
    };
    const send = (status, type, body) => { res.writeHead(status, { ...headers, "Content-Type": type }); res.end(body); };
    // Protection contre le « DNS rebinding » : seul l'accès par 127.0.0.1 ou localhost est accepté.
    if (!allowedHosts.has(String(req.headers.host ?? "").toLowerCase())) return send(403, "text/plain; charset=utf-8", "Forbidden");
    if (req.method !== "GET") return send(405, "text/plain; charset=utf-8", "Method Not Allowed");
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/") return send(200, "text/html; charset=utf-8", PAGE);
    if (url.pathname === "/project.json") {
      try { return send(200, "application/json; charset=utf-8", JSON.stringify({ version, file: basename(path), ...compileForPreview(path) })); }
      catch (e) { return send(200, "application/json; charset=utf-8", JSON.stringify({ version, ok: false, errors: [String(e?.message ?? e)], warnings: [] })); }
    }
    if (url.pathname === "/events") {
      res.writeHead(200, { ...headers, "Content-Type": "text/event-stream", Connection: "keep-alive" });
      res.write(`data: ${version}\n\n`);
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }
    const m = /^\/web\/([\w.-]+)$/.exec(url.pathname);
    if (m && WEB_FILES.has(m[1]) && existsSync(WEB_DIR + m[1])) return send(200, WEB_FILES.get(m[1]), readFileSync(WEB_DIR + m[1]));
    return send(404, "text/plain; charset=utf-8", "Not Found");
  });

  const timer = setInterval(() => {
    let m;
    try { m = statSync(path).mtimeMs; } catch { return; }
    if (m === mtime) return;
    mtime = m; version++;
    for (const c of clients) c.write(`data: ${version}\n\n`);
    onReload(version);
  }, 300);
  timer.unref();

  return new Promise((resolveStart, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const actual = server.address().port;
      allowedHosts = new Set([`127.0.0.1:${actual}`, `localhost:${actual}`]);
      const url = `http://127.0.0.1:${actual}/`;
      if (open) openBrowser(url);
      resolveStart({
        url, port: actual,
        close: () => new Promise((done) => { clearInterval(timer); for (const c of clients) c.end(); clients.clear(); server.close(() => done()); server.closeAllConnections?.(); }),
      });
    });
  });
}

/** Commande `berkios apercu` / `preview`. Renvoie le code de sortie (le serveur garde le processus actif). */
export async function previewCommand(args, io = { out: (s) => console.log(s), err: (s) => console.error(s) }) {
  const t = T[uiLang()];
  let file, portArg;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port" || args[i] === "-p") portArg = args[++i];
    else if (!args[i].startsWith("-") && file === undefined) file = args[i];
  }
  if (!file) { io.err(t.usage); return 1; }
  if (!existsSync(file)) { io.err(fmt(t.noFile, { file })); return 1; }
  const port = portArg === undefined ? 0 : Number(portArg);
  if (!Number.isInteger(port) || port < 0 || port > 65535) { io.err(fmt(t.badPort, { port: portArg })); return 1; }
  const open = !args.includes("--no-open") && !args.includes("--sans-ouvrir");

  const first = compileForPreview(file);
  for (const w of first.warnings) io.err(w);
  if (first.isCli) { io.err(fmt(t.notInterface, { file })); return 1; }
  if (!first.ok) { for (const e of first.errors) io.err(e); io.err(fmt(t.failed, { n: first.errors.length })); return 1; }

  let server;
  try { server = await startPreview({ file, port, open: false, onReload: () => io.out(fmt(t.reloaded, { time: new Date().toLocaleTimeString() })) }); }
  catch (e) { io.err(String(e?.message ?? e)); return 1; }
  io.out(fmt(t.listening, { name: first.project.name, url: server.url }));
  io.out(t.stop);
  if (open && !openBrowser(server.url)) io.out(t.openFail);
  process.once("SIGINT", async () => { await server.close(); process.exit(0); });
  return 0;
}
