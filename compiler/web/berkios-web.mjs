// Moteur d'affichage BERKIOS pour navigateur : lit un projet compilé (schéma 1.2) et fait fonctionner l'application dans une page.
// Aucune dépendance. Usage : mountApp(élément, projet, options) — voir README, section « Aperçu dans le navigateur ».
//
// Périmètre (honnête) : les six composants produits par BERKIOS CODE (étiquette, bouton, champ, case à cocher, tableau, panneau),
// les interfaces page / fenêtre modale / panneau latéral, et les actions : ouvrir/fermer une interface, message, montrer/cacher/basculer,
// envoyer/vider le formulaire, appel d'API. Les actions Excel et les autres composants du Studio ne sont pas exécutés ici.
import { DataStore, messagesFor, format, validateWidgetValue, norm } from "./data-store.mjs";

const SAFE_COLOR = /^(#[0-9a-f]{3,8}|transparent|currentcolor|(rgb|hsl)a?\([\d\s.,%/a-z-]+\)|[a-z]{3,20})$/i;
const color = (v, fallback) => (typeof v === "string" && SAFE_COLOR.test(v.trim()) ? v.trim() : fallback);
const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const FLEX = { left: "flex-start", center: "center", right: "flex-end" };

function safeStorage() {
  try { const s = globalThis.localStorage; s.setItem("berkios:test", "1"); s.removeItem("berkios:test"); return s; } catch { return null; }
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children) if (c) node.append(c);
  return node;
}

/**
 * Monte l'application dans `container`.
 * @param {HTMLElement} container
 * @param {object} project projet compilé (résultat de compile().project, ou fichier .berkios.json)
 * @param {{ storage?: Storage|null, storageKey?: string, toolbar?: boolean, onTitle?: (title:string)=>void }} [options]
 */
export function mountApp(container, project, options = {}) {
  const meta = project["x-berkios"] ?? {};
  const M = messagesFor(meta.sourceLanguage ?? "en");
  const store = new DataStore(project, { storage: options.storage === undefined ? safeStorage() : options.storage, key: options.storageKey });
  const interfaces = project.interfaces?.length ? project.interfaces : [{ id: "i_main", name: project.name ?? "main", kind: "page", canvas: project.canvas, widgets: project.widgets ?? [] }];
  const byId = new Map(interfaces.map((i) => [i.id, i]));
  const tables = meta.tables ?? {};
  const titles = meta.interfaceTitles ?? {};
  const abort = new AbortController();
  const cleanups = [() => abort.abort()];

  container.replaceChildren();
  container.classList.add("bk-app");
  const viewport = el("div", { class: "bk-viewport" });
  const fit = el("div", { class: "bk-fit" });
  const stage = el("div", { class: "bk-stage" });
  const layer = el("div", { class: "bk-layer" });
  const toastEl = el("div", { class: "bk-toast", role: "status", "aria-live": "polite", hidden: "" });
  stage.append(layer);
  fit.append(stage);
  viewport.append(fit);
  if (options.toolbar !== false) {
    const bar = el("div", { class: "bk-bar" }, el("strong", { text: project.name ?? "BERKIOS" }), el("span", { class: "bk-ver", text: project.appVersion ? `v${project.appVersion}` : "" }));
    if (store.models.length) bar.append(el("button", { type: "button", class: "bk-reset", text: M.resetData, onclick: () => { store.reset(); refreshTables(); } }));
    container.append(bar);
  }
  container.append(viewport, toastEl);

  /** @type {{iface:object, el:HTMLElement, els:Map<string,HTMLElement>, widgets:Map<string,object>, overlay:boolean, wrap?:HTMLElement}|null} */
  let page = null;
  const overlays = [];
  let scale = 1;

  /* ───── mise à l'échelle ───── */
  function applyScale() {
    const cw = num(page?.iface.canvas?.width, 1280), ch = num(page?.iface.canvas?.height, 720);
    const vw = viewport.clientWidth || cw, vh = viewport.clientHeight || ch;
    scale = Math.min(1, (vw - 16) / cw, vh > 100 ? (vh - 16) / ch : 1);
    if (!(scale > 0)) scale = 1;
    stage.style.width = `${cw}px`; stage.style.height = `${ch}px`;
    stage.style.transform = `scale(${scale})`;
    fit.style.width = `${cw * scale}px`; fit.style.height = `${ch * scale}px`;
  }
  if (typeof ResizeObserver !== "undefined") { const ro = new ResizeObserver(applyScale); ro.observe(viewport); cleanups.push(() => ro.disconnect()); }

  /* ───── messages ───── */
  let toastTimer = 0;
  function toast(text) {
    toastEl.textContent = text; toastEl.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.hidden = true; }, 4000);
  }
  cleanups.push(() => clearTimeout(toastTimer));

  /* ───── composants ───── */
  function box(node, w) {
    const s = w.style ?? {};
    Object.assign(node.style, {
      position: "absolute", left: `${num(w.x)}px`, top: `${num(w.y)}px`, width: `${num(w.width, 100)}px`, height: `${num(w.height, 40)}px`, boxSizing: "border-box",
      color: color(s.color, "inherit"), background: color(s.background, "transparent"), fontSize: `${num(s.fontSize, 14)}px`,
      fontWeight: s.fontWeight === "bold" ? "700" : "400", borderRadius: `${num(s.radius)}px`,
    });
    if (num(s.borderWidth) > 0) node.style.border = `${num(s.borderWidth)}px solid ${color(s.borderColor, "#cbd5e1")}`;
    node.dataset.widget = w.id;
  }
  const align = (w) => FLEX[w.style?.align] ?? "flex-start";

  function renderTable(node, w) {
    const t = tables[w.id];
    node.replaceChildren();
    if (!t?.model || !store.model(t.model)) { node.append(el("div", { class: "bk-table-note", text: w.text ?? "" })); return; }
    const model = store.model(t.model);
    const cols = (t.columns?.length ? t.columns : model.fields.map((f) => f.name)).map((c) => model.fields.find((f) => norm(f.name) === norm(c)) ?? { name: c, type: "text" });
    const table = el("table", {}, el("thead", {}, el("tr", {}, ...cols.map((c) => el("th", { scope: "col", text: c.name, class: ["integer", "decimal", "amount"].includes(c.type) ? "bk-num" : "" })))));
    const body = el("tbody");
    const rows = store.rows(model.name);
    if (!rows.length) body.append(el("tr", {}, el("td", { colspan: String(cols.length), class: "bk-empty", text: M.empty })));
    for (const r of rows) body.append(el("tr", {}, ...cols.map((c) => {
      const v = r[c.name];
      const text = v === null || v === undefined ? "" : c.type === "boolean" ? (v ? "✓" : "—") : c.type === "amount" ? Number(v).toFixed(2) : String(v);
      return el("td", { text, class: ["integer", "decimal", "amount"].includes(c.type) ? "bk-num" : "" });
    })));
    table.append(body);
    node.append(table);
  }

  function createWidget(w, inst) {
    let node;
    switch (w.type) {
      case "label": node = el("div", { class: "bk-label", text: w.text ?? "" }); node.style.justifyContent = align(w); break;
      case "panel": node = el("div", { class: "bk-panel" }); break;
      case "button": node = el("button", { type: "button", class: "bk-button", text: w.text ?? "" }); node.addEventListener("click", () => runAction(w.buttonAction, inst, w), { signal: abort.signal }); node.style.justifyContent = "center"; break;
      case "input": {
        node = el("input", { class: "bk-input", type: ["text", "email", "number", "date", "time", "tel", "url"].includes(w.inputKind) ? w.inputKind : "text", placeholder: w.text ?? "", "aria-label": w.text || w.name || "" });
        if (w.inputKind === "number") node.setAttribute("step", "any");
        node.style.textAlign = w.style?.align ?? "left";
        break;
      }
      case "checkbox": {
        const cb = el("input", { type: "checkbox" });
        node = el("label", { class: "bk-check" }, cb, el("span", { text: w.text ?? "" }));
        node.style.justifyContent = align(w);
        break;
      }
      case "table": node = el("div", { class: "bk-table" }); renderTable(node, w); break;
      default: node = el("div", { class: "bk-unknown", text: format(M.unknownWidget, { type: w.type }) });
    }
    box(node, w);
    if (w.visible === false) node.style.display = "none";
    return node;
  }

  function buildInstance(iface, overlay) {
    const canvas = el("div", { class: "bk-canvas" });
    Object.assign(canvas.style, { position: "relative", width: `${num(iface.canvas?.width, 1280)}px`, height: `${num(iface.canvas?.height, 720)}px`, background: color(iface.canvas?.background, "#ffffff") });
    if (iface.theme === "dark") canvas.classList.add("bk-dark");
    const inst = { iface, el: canvas, els: new Map(), widgets: new Map(), overlay };
    for (const w of iface.widgets ?? []) {
      const node = createWidget(w, inst);
      inst.els.set(w.id, node); inst.widgets.set(w.id, w);
      canvas.append(node);
    }
    return inst;
  }

  const instances = () => [page, ...overlays].filter(Boolean);
  function refreshTables() {
    for (const inst of instances()) for (const [id, w] of inst.widgets) if (w.type === "table") renderTable(inst.els.get(id), w);
  }
  function findEl(id, inst) {
    return inst?.els.get(id) ?? instances().map((i) => i.els.get(id)).find(Boolean) ?? null;
  }

  /* ───── interfaces ───── */
  function openInterface(id) {
    const iface = byId.get(id);
    if (!iface) { toast(format(M.unsupported, { type: `open-interface → ${id}` })); return; }
    options.onTitle?.(titles[id] ?? iface.name);
    if (iface.kind === "modal" || iface.kind === "drawer") {
      if (!page) openInterface((interfaces.find((i) => i.kind === "page") ?? { id: "" }).id);
      const inst = buildInstance(iface, true);
      const label = titles[id] ?? iface.name;
      const holder = el("div", { class: iface.kind === "drawer" ? "bk-drawer" : "bk-modal", role: "dialog", "aria-modal": "true", "aria-label": label });
      holder.append(inst.el);
      const close = el("button", { type: "button", class: "bk-close", "aria-label": M.close, text: "×", onclick: () => closeTop() });
      holder.append(close);
      const scrim = el("div", { class: "bk-scrim" }, holder);
      scrim.addEventListener("mousedown", (e) => { if (e.target === scrim) closeTop(); }, { signal: abort.signal });
      inst.wrap = scrim; overlays.push(inst); layer.append(scrim);
      queueMicrotask(() => (inst.el.querySelector("input,button") ?? holder).focus?.());
      return;
    }
    for (const o of overlays.splice(0)) o.wrap.remove();
    page?.el.remove();
    page = buildInstance(iface, false);
    stage.insertBefore(page.el, layer);
    applyScale();
  }
  function closeTop() {
    const top = overlays.pop();
    top?.wrap.remove();
    return Boolean(top);
  }
  const onKey = (e) => { if (e.key === "Escape" && overlays.length) { closeTop(); e.preventDefault(); } };
  document.addEventListener("keydown", onKey, { signal: abort.signal });

  /* ───── formulaires ───── */
  const clearErrors = (inst) => { inst.el.querySelectorAll(".bk-error").forEach((n) => n.remove()); inst.el.querySelectorAll("[aria-invalid]").forEach((n) => n.removeAttribute("aria-invalid")); };
  function showError(inst, w, err) {
    const target = inst.els.get(w.id);
    if (!target) return;
    target.setAttribute("aria-invalid", "true");
    inst.el.append(el("div", { class: "bk-error", role: "alert", style: `left:${num(w.x)}px;top:${num(w.y) + num(w.height) + 2}px`, text: format(M[err.code] ?? err.code, err.params) }));
  }
  const fieldWidgets = (inst) => [...inst.widgets.values()].filter((w) => (w.type === "input" || w.type === "checkbox") && inst.els.get(w.id).style.display !== "none");
  const readValue = (inst, w) => (w.type === "checkbox" ? inst.els.get(w.id).querySelector("input").checked : inst.els.get(w.id).value);

  function resetForm(inst) {
    clearErrors(inst);
    for (const w of fieldWidgets(inst)) { const n = inst.els.get(w.id); if (w.type === "checkbox") n.querySelector("input").checked = false; else n.value = ""; }
  }

  function submitForm(inst) {
    clearErrors(inst);
    const fields = fieldWidgets(inst);
    let ok = true;
    for (const w of fields) {
      if (w.type !== "input") continue;
      const err = validateWidgetValue(w, readValue(inst, w));
      if (err) { showError(inst, w, err); ok = false; }
    }
    if (!ok) return;
    const model = store.matchModel(fields.map((w) => w.name));
    if (!model) { toast(M.formValid); return; }
    const result = store.insert(model.name, Object.fromEntries(fields.map((w) => [w.name, readValue(inst, w)])));
    if (!result.ok) {
      for (const e of result.errors) { const w = fields.find((f) => norm(f.name) === norm(e.field)); if (w) showError(inst, w, e); }
      return;
    }
    toast(M.saved);
    resetForm(inst);
    refreshTables();
    if (inst.overlay) closeTop();
  }

  /* ───── actions ───── */
  function setText(node, text) {
    if (!node) return;
    if ("value" in node) node.value = text; else node.textContent = text;
  }
  async function apiRequest(action, inst) {
    const target = action.responseTargetWidgetId ? findEl(action.responseTargetWidgetId, inst) : null;
    const url = String(action.apiUrl ?? "");
    if (!/^https?:\/\//i.test(url)) { toast(format(M.apiError, { error: url || "URL" })); return; }
    setText(target, M.apiLoading);
    try {
      const res = await fetch(url, { method: action.apiMethod || "GET", credentials: "omit", redirect: "follow", signal: abort.signal });
      const text = await res.text();
      let shown = text;
      try { shown = JSON.stringify(JSON.parse(text), null, 2); } catch { /* texte brut */ }
      if (target) setText(target, shown); else toast(shown.slice(0, 200));
    } catch (e) {
      if (abort.signal.aborted) return;
      setText(target, "");
      toast(format(M.apiError, { error: e?.message ?? String(e) }));
    }
  }

  function runAction(action, inst) {
    if (!action || action.type === "none") return;
    switch (action.type) {
      case "open-interface": openInterface(action.targetInterfaceId); break;
      case "close-interface": closeTop(); break;
      case "message": toast(action.message ?? ""); break;
      case "show-widget": case "hide-widget": case "toggle-widget": {
        const node = findEl(action.targetWidgetId, inst);
        if (!node) break;
        const hidden = node.style.display === "none";
        node.style.display = action.type === "show-widget" || (action.type === "toggle-widget" && hidden) ? "" : "none";
        break;
      }
      case "submit-form": submitForm(inst); break;
      case "reset-form": resetForm(inst); break;
      case "api-request": apiRequest(action, inst); break;
      case "excel-read": case "excel-write": toast(M.excel); break;
      default: toast(format(M.unsupported, { type: action.type }));
    }
  }

  openInterface(project.mainInterfaceId && byId.has(project.mainInterfaceId) ? project.mainInterfaceId : (interfaces.find((i) => i.kind === "page") ?? interfaces[0]).id);

  return {
    store, project,
    open: openInterface,
    destroy() { for (const c of cleanups) c(); container.replaceChildren(); container.classList.remove("bk-app"); },
  };
}
