// Page d'aperçu de `berkios apercu` : charge le projet compilé et se recharge quand le fichier .bk change.
import { mountApp } from "./berkios-web.mjs";

const app = document.getElementById("app");
const errors = document.getElementById("errors");
let mounted = null;
let currentKey = "";

async function load() {
  let data;
  try { data = await (await fetch("/project.json", { cache: "no-store" })).json(); }
  catch { errors.hidden = false; errors.textContent = "Connexion au serveur d'aperçu perdue. / Preview server connection lost."; return; }
  document.title = `BERKIOS — ${data.file}`;
  if (!data.ok) {
    errors.hidden = false;
    errors.textContent = (data.errors ?? []).join("\n") || "Erreur.";
    return;
  }
  errors.hidden = true;
  mounted?.destroy();
  mounted = mountApp(app, data.project, { storageKey: `preview:${data.file}`, onTitle: (title) => { document.title = `${title} — ${data.file}`; } });
}

await load();
const events = new EventSource("/events");
events.onmessage = (e) => { if (e.data !== currentKey) { const first = currentKey === ""; currentKey = e.data; if (!first) load(); } };
