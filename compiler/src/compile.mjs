import { Diag, closest } from "./diagnostics.mjs";
import { parse, WIDGET_KINDS } from "./parser.mjs";
import { getLexicon, norm } from "./lexicon.mjs";

/* ───────── Constantes alignées sur le Studio (schéma 1.2) ───────── */

const GAP = 16, PAD = 16, MARGIN = 32;
const BASE_STYLE = { color: "#182230", background: "transparent", fontSize: 14, fontWeight: "normal", align: "left", radius: 0, borderColor: "#cbd5e1", borderWidth: 0 };
const KIND_STYLE = {
  label: { fontSize: 20 },
  button: { color: "#ffffff", background: "#2563eb", fontWeight: "bold", align: "center", radius: 10 },
  input: { background: "#ffffff", color: "#475467", radius: 8, borderWidth: 1 },
  checkbox: {},
  table: { background: "#ffffff", radius: 10, borderWidth: 1 },
  panel: { background: "#f1f5f9", radius: 12, borderWidth: 1, borderColor: "#e2e8f0" },
};
const DEFAULT_SIZE = { label: [260, 40], button: [180, 44], input: [240, 42], checkbox: [200, 32], table: [420, 240], panel: [320, 200] };
const FREE_KINDS = ["label", "button", "input", "checkbox", "panel"];
const EDITION_MAX = { free: 12, pro: 100, premium: Infinity };
const CANVAS_BY_DISPLAY = { DISP_PAGE: [1280, 720], DISP_MODAL: [520, 380], DISP_DRAWER: [380, 720] };
const DISPLAY_KIND = { DISP_PAGE: "page", DISP_MODAL: "modal", DISP_DRAWER: "drawer" };
const INPUT_KIND = { FMT_TEXT: "text", FMT_EMAIL: "email", FMT_NUMBER: "number", FMT_DATE: "date", FMT_TIME: "time", FMT_PHONE: "tel", FMT_URL: "url" };
const ALIGN = { ALIGN_LEFT: "left", ALIGN_CENTER: "center", ALIGN_RIGHT: "right" };
const FIELD_TYPE = { T_TEXT: "text", T_INT: "integer", T_DECIMAL: "decimal", T_AMOUNT: "amount", T_DATE: "date", T_BOOL: "boolean" };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const slug = (s) => norm(s).replace(/[^a-z0-9_]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "") || "x";
const widgetSlug = (s) => { const v = slug(s); return /^[0-9]/.test(v) ? `c_${v}` : v; };

function* walk(items) { for (const it of items) { yield it; yield* walk(it.children ?? []); } }

/* ───────── Analyse sémantique ───────── */

function analyze(ast, lex, diags) {
  const err = (code, params, at, severity = "error") => diags.push(new Diag(code, params, at?.line ?? 1, at?.col ?? 1, severity));
  const key = (s) => lex.key(s);
  const hint = (name, candidates) => {
    const s = closest(key(name), candidates.map((c) => ({ key: key(c), label: c })));
    return s ? lex.msg("E_HINT", { suggestion: s }) : "";
  };

  // application
  if (ast.applications.length === 0) { err("E_NO_APPLICATION", {}, { line: 1 }); return null; }
  for (const extra of ast.applications.slice(1)) err("E_DUP_APPLICATION", {}, extra);
  const app = ast.applications[0];
  const isExcel = app.appType === "TYPE_EXCEL";
  const isCli = app.appType === "TYPE_COMMAND";
  if (!isExcel && app.platforms?.includes("excel")) err("E_EXCEL_ONLY", {}, app);

  // modèles
  const models = new Map();
  for (const m of ast.models) {
    if (models.has(key(m.name))) err("E_DUP", { name: m.name, where: lex.msg("WHERE_FILE") }, m);
    models.set(key(m.name), m);
    const seen = new Set();
    for (const f of m.fields) {
      if (seen.has(key(f.name))) err("E_DUP", { name: f.name, where: `${lex.msg("LABEL_MODEL")} ${m.name}` }, f);
      seen.add(key(f.name));
    }
  }

  // interfaces
  if (isCli) {
    if (ast.interfaces.length) err("E_CLI_NO_UI", {}, ast.interfaces[0]);
    if (ast.commands.length === 0) err("E_NO_COMMAND", {}, app);
    analyzeCommands(ast, lex, err, hint, key);
  } else if (ast.commands.length) err("E_CLI_ONLY", {}, ast.commands[0]);
  if (isCli) { /* pas d'interface dans une application en ligne de commande */ }
  else if (ast.interfaces.length === 0) err("E_NO_INTERFACE", {}, app);
  else if ((ast.interfaces[0].display ?? "DISP_PAGE") !== "DISP_PAGE") err("E_NO_PAGE", {}, ast.interfaces[0]);
  const ifaces = new Map();
  for (const i of ast.interfaces) {
    if (ifaces.has(key(i.name))) err("E_DUP", { name: i.name, where: lex.msg("WHERE_FILE") }, i);
    ifaces.set(key(i.name), i);
  }

  // composants : noms, références, Excel, édition
  const names = new Map();      // composant -> nom final (identifiant technique)
  const total = { count: 0 };
  for (const iface of ast.interfaces) {
    const byKey = new Map();
    const used = new Set();
    for (const w of walk(iface.items)) {
      total.count++;
      if (w.name) {
        if (byKey.has(key(w.name))) err("E_DUP", { name: w.name, where: `${lex.msg("LABEL_INTERFACE")} ${iface.name}` }, w);
        byKey.set(key(w.name), w);
      }
      const base = widgetSlug(w.name ?? w.text ?? w.kind);
      let final = base, n = 2;
      while (used.has(final)) final = `${base}_${n++}`;
      used.add(final);
      names.set(w, final);
    }
    for (const w of walk(iface.items)) {
      if (w.kind === "table" && w.source) {
        const model = models.get(key(w.source));
        if (!model) err("E_UNKNOWN_REF", { what: lex.msg("LABEL_MODEL"), name: w.source, hint: hint(w.source, ast.models.map((m) => m.name)) }, w);
        else for (const col of w.columns ?? []) {
          if (!model.fields.some((f) => key(f.name) === key(col))) err("E_UNKNOWN_COLUMN", { model: model.name, name: col, hint: hint(col, model.fields.map((f) => f.name)) }, w);
        }
      }
      if ((w.cell || w.sheet) && !isExcel) err("E_EXCEL_ONLY", {}, w);
      if (w.sheet && !w.cell) err("E_EXCEL_CELL", {}, w);
      const a = w.onClick;
      if (!a) continue;
      if (a.type === "A_OPEN" && !ifaces.has(key(a.target))) err("E_UNKNOWN_REF", { what: lex.msg("LABEL_INTERFACE"), name: a.target, hint: hint(a.target, ast.interfaces.map((i) => i.name)) }, a);
      for (const t of [["A_SHOW", a.target], ["A_HIDE", a.target], ["A_TOGGLE", a.target], ["A_REQUEST", a.responseTarget]]) {
        if (a.type === t[0] && t[1] !== undefined && !byKey.has(key(t[1]))) err("E_UNKNOWN_REF", { what: lex.msg("LABEL_WIDGET"), name: t[1], hint: hint(t[1], [...byKey.values()].map((x) => x.name)) }, a);
      }
      if (a.type === "A_READ_EXCEL" || a.type === "A_WRITE_EXCEL") {
        if (!isExcel) err("E_EXCEL_ONLY", {}, a);
        else if (!w.cell) err("E_EXCEL_CELL", {}, a);
      }
    }
  }
  // édition (mêmes limites provisoires que le Studio)
  const maxW = EDITION_MAX[app.edition];
  if (app.edition === "free") {
    const bad = [...ast.interfaces.flatMap((i) => [...walk(i.items)])].find((w) => !FREE_KINDS.includes(w.kind));
    if (bad) err("E_EDITION", { edition: "Free", reason: lex.msg("REASON_NO_TABLE") }, bad);
  }
  if (total.count > maxW) err("E_EDITION", { edition: app.edition, reason: lex.msg("REASON_MAX", { max: maxW, count: total.count }) }, app);
  return { app, isExcel, isCli, names, ifaceKeys: ifaces, key };
}

/* ───────── Mise en page automatique ───────── */

function makeWidget(item, x, y, w, h, ctx, group) {
  const name = ctx.names.get(item);
  const style = { ...BASE_STYLE, ...KIND_STYLE[item.kind] };
  if (item.color) style.color = item.color;
  if (item.background) style.background = item.background;
  if (item.textSize) style.fontSize = item.textSize;
  if (item.bold) style.fontWeight = "bold";
  if (item.align) style.align = ALIGN[item.align];
  const widget = {
    id: `w_${ctx.ifaceSlug}_${name}`, type: item.kind, name,
    text: item.kind === "panel" ? "" : (item.text ?? item.name ?? ""),
    x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h),
    visible: true, locked: false, style,
  };
  if (group) widget.groupName = group;
  if (item.kind === "input") {
    if (item.format) widget.inputKind = INPUT_KIND[item.format];
    const numeric = item.format === "FMT_NUMBER";
    const v = {};
    if (item.required) v.required = true;
    if (item.min !== undefined) v[numeric ? "min" : "minLength"] = item.min;
    if (item.max !== undefined) v[numeric ? "max" : "maxLength"] = item.max;
    if (Object.keys(v).length) widget.validation = v;
  }
  if (item.cell) widget.excelBinding = { address: item.cell, ...(item.sheet ? { worksheet: item.sheet } : {}) };
  ctx.widgetIds.set(item, widget.id);
  if (item.onClick) ctx.pending.push({ widget, action: item.onClick });
  if (item.kind === "table" && (item.source || item.columns)) ctx.tables[widget.id] = { ...(item.source ? { model: ctx.modelName(item.source) } : {}), ...(item.columns ? { columns: item.columns.map(ctx.fieldName(item.source)) } : {}) };
  return widget;
}

function place(item, x, y, availW, dir, ctx, group) {
  if (item.kind === "panel") {
    const innerDir = item.layout === "LAYOUT_ROW" ? "row" : "column";
    const explicitW = item.size?.width;
    const inner = flow(item.children, x + PAD, y + PAD, (explicitW ?? availW) - 2 * PAD, innerDir, ctx, ctx.names.get(item));
    const w = explicitW ?? (dir === "column" ? availW : inner.w + 2 * PAD);
    const h = item.size?.height ?? inner.h + 2 * PAD;
    return { list: [makeWidget(item, x, y, w, h, ctx, group), ...inner.list], w, h };
  }
  const [dw, dh] = DEFAULT_SIZE[item.kind];
  const w = item.size?.width ?? (item.kind === "table" && dir === "column" ? availW : dw);
  const h = item.size?.height ?? dh;
  return { list: [makeWidget(item, x, y, w, h, ctx, group)], w, h };
}

function flow(items, x0, y0, availW, dir, ctx, group) {
  let x = x0, y = y0, w = 0, h = 0;
  const list = [];
  for (const item of items) {
    const abs = item.position;
    const px = abs ? abs.x : x, py = abs ? abs.y : y;
    const p = place(item, px, py, availW, dir, ctx, group);
    list.push(...p.list);
    if (abs) continue;
    w = Math.max(w, px - x0 + p.w);
    h = Math.max(h, py - y0 + p.h);
    if (dir === "row") x += p.w + GAP; else y += p.h + GAP;
  }
  return { list, w, h };
}

/* ───────── Émission du projet JSON (schéma 1.2) ───────── */

function emit(ast, info, lex, options, diags) {
  const { app, isExcel } = info;
  const now = options.now ?? new Date().toISOString();
  const interfaces = [];
  const ifaceIds = new Map();
  const used = new Set();
  for (const iface of ast.interfaces) {
    let id = `i_${slug(iface.name)}`;
    while (used.has(id)) id += "_";
    used.add(id);
    ifaceIds.set(info.key(iface.name), id);
  }
  const modelName = (n) => ast.models.find((m) => info.key(m.name) === info.key(n))?.name ?? n;
  const tables = {}, titles = {};
  const allIds = new Map(); // composant -> id (toutes interfaces)

  for (const iface of ast.interfaces) {
    const display = iface.display ?? "DISP_PAGE";
    const [dw, dh] = CANVAS_BY_DISPLAY[display];
    const canvas = {
      width: clamp(Math.round(iface.size?.width ?? dw), 200, 4000),
      height: clamp(Math.round(iface.size?.height ?? dh), 200, 4000),
      background: iface.background ?? "#ffffff",
    };
    const ctx = {
      names: info.names, ifaceSlug: slug(iface.name), widgetIds: new Map(), pending: [], tables, modelName,
      fieldName: (src) => { const m = src ? ast.models.find((x) => info.key(x.name) === info.key(src)) : null; return (c) => m?.fields.find((f) => info.key(f.name) === info.key(c))?.name ?? c; },
    };
    const { list } = flow(iface.items, MARGIN, MARGIN, canvas.width - 2 * MARGIN, "column", ctx);
    const byKey = new Map();
    for (const it of walk(iface.items)) if (it.name) byKey.set(info.key(it.name), ctx.widgetIds.get(it));
    for (const { widget, action: a } of ctx.pending) {
      const act = {};
      switch (a.type) {
        case "A_OPEN": act.type = "open-interface"; act.targetInterfaceId = ifaceIds.get(info.key(a.target)); break;
        case "A_CLOSE": act.type = "close-interface"; break;
        case "A_MESSAGE": act.type = "message"; act.message = a.message; break;
        case "A_SHOW": act.type = "show-widget"; act.targetWidgetId = byKey.get(info.key(a.target)); break;
        case "A_HIDE": act.type = "hide-widget"; act.targetWidgetId = byKey.get(info.key(a.target)); break;
        case "A_TOGGLE": act.type = "toggle-widget"; act.targetWidgetId = byKey.get(info.key(a.target)); break;
        case "A_SUBMIT": act.type = "submit-form"; break;
        case "A_RESET": act.type = "reset-form"; break;
        case "A_REQUEST":
          act.type = "api-request"; act.apiMethod = a.method; act.apiUrl = a.url;
          if (a.responseTarget) act.responseTargetWidgetId = byKey.get(info.key(a.responseTarget));
          break;
        case "A_READ_EXCEL": act.type = "excel-read"; break;
        case "A_WRITE_EXCEL": act.type = "excel-write"; break;
      }
      widget.buttonAction = act;
    }
    for (const w of list) {
      if (w.x + w.width > canvas.width || w.y + w.height > canvas.height) {
        diags.push(new Diag("W_OUTSIDE", { name: w.name, iface: iface.name, w: canvas.width, h: canvas.height }, 1, 1, "warning"));
      }
    }
    const id = ifaceIds.get(info.key(iface.name));
    if (iface.title) titles[id] = iface.title;
    interfaces.push({ id, name: iface.name, kind: DISPLAY_KIND[display], ...(iface.theme ? { theme: iface.theme === "THEME_DARK" ? "dark" : "light" } : {}), canvas, widgets: list });
  }

  const first = interfaces[0];
  const version = app.version.split(".").length === 2 ? `${app.version}.0` : app.version;
  const defaultTargets = isExcel ? ["excel"] : ["windows", "macos", "linux", "android"];
  let targets = app.platforms ?? defaultTargets;
  if (isExcel && !targets.includes("excel")) targets = ["excel", ...targets];
  return {
    schemaVersion: "1.2",
    mode: isExcel ? "excel" : "standalone",
    name: app.name,
    description: app.description,
    author: app.author,
    appVersion: version,
    targets,
    edition: app.edition,
    canvas: first.canvas,
    widgets: first.widgets,
    interfaces,
    activeInterfaceId: first.id,
    mainInterfaceId: first.id,
    createdAt: now,
    updatedAt: now,
    "x-berkios": {
      formatVersion: "0.1",
      sourceLanguage: ast.language,
      models: ast.models.map((m) => ({ name: m.name, fields: m.fields.map((f) => ({ name: f.name, type: FIELD_TYPE[f.type], ...(f.unique ? { unique: true } : {}), ...(f.required ? { required: true } : {}), ...(f.min !== undefined ? { min: f.min } : {}), ...(f.max !== undefined ? { max: f.max } : {}) })) })),
      tables,
      interfaceTitles: titles,
    },
  };
}


/* ───────── Applications en ligne de commande ───────── */

const CLI_TYPE = { T_TEXT: "text", T_INT: "integer", T_DECIMAL: "decimal", T_BOOL: "boolean" };
const NEUTRAL = { text: "", integer: 0, decimal: 0, boolean: false };
const idOf = (lex, name) => lex.key(name).replace(/ /g, "_");

function analyzeCommands(ast, lex, err, hint, key) {
  const seenCmd = new Set();
  const checkExpr = (e, scope, line) => {
    switch (e.k) {
      case "ref": {
        const id = idOf(lex, e.name);
        if (!scope.has(id)) err("E_UNKNOWN_REF", { what: lex.msg("LABEL_VARIABLE"), name: e.name, hint: hint(e.name, [...scope.values()]) }, { line });
        break;
      }
      case "cat": e.parts.forEach((x) => checkExpr(x, scope, line)); break;
      case "bin": checkExpr(e.l, scope, line); checkExpr(e.r, scope, line); break;
      case "neg": checkExpr(e.e, scope, line); break;
    }
  };
  const checkBlock = (stmts, scope, params) => {
    for (const st of stmts) {
      switch (st.k) {
        case "print": case "error": checkExpr(st.e, scope, st.line); break;
        case "exit": if (st.e) checkExpr(st.e, scope, st.line); break;
        case "set": {
          checkExpr(st.e, scope, st.line);
          const id = idOf(lex, st.name);
          if (params.has(id)) err("E_ASSIGN_PARAM", { name: st.name }, st);
          else if (!scope.has(id)) scope.set(id, st.name);
          break;
        }
        case "if":
          checkExpr(st.cond.l, scope, st.line);
          if (st.cond.r) checkExpr(st.cond.r, scope, st.line);
          checkBlock(st.then, new Map(scope), params);
          if (st.else) checkBlock(st.else, new Map(scope), params);
          break;
        case "repeat": checkExpr(st.n, scope, st.line); checkBlock(st.body, new Map(scope), params); break;
      }
    }
  };
  for (const c of ast.commands) {
    if (seenCmd.has(key(c.name))) err("E_DUP", { name: c.name, where: lex.msg("WHERE_FILE") }, c);
    seenCmd.add(key(c.name));
    const params = new Map();
    for (const p of c.params) {
      const id = idOf(lex, p.name);
      if (params.has(id)) err("E_DUP", { name: p.name, where: c.name }, p);
      params.set(id, p.name);
      const d = p.default;
      const okDefault = d === undefined || (p.type === "T_TEXT" && typeof d === "string") || (p.type === "T_INT" && Number.isInteger(d)) || (p.type === "T_DECIMAL" && typeof d === "number") || (p.type === "T_BOOL" && typeof d === "boolean");
      if (!okDefault) err("E_BAD_DEFAULT", { type: lex.word(p.type) }, p);
    }
    if (!c.action) err("E_NO_ACTION", { name: c.name }, c);
    else checkBlock(c.action, new Map(params), params);
  }
}

function emitCli(ast, lex, options) {
  const app = ast.applications[0];
  const exprIR = (e) => {
    switch (e.k) {
      case "str": return { k: "str", v: e.v };
      case "num": return { k: "num", v: e.v };
      case "bool": return { k: "bool", v: e.v };
      case "ref": return { k: "ref", id: idOf(lex, e.name) };
      case "cat": return { k: "cat", parts: e.parts.map(exprIR) };
      case "bin": return { k: "bin", op: e.op, l: exprIR(e.l), r: exprIR(e.r) };
      case "neg": return { k: "neg", e: exprIR(e.e) };
    }
  };
  const OPS = { CMP_EQ: "eq", CMP_NE: "ne", CMP_LT: "lt", CMP_GT: "gt", CMP_LE: "le", CMP_GE: "ge" };
  const blockIR = (stmts) => stmts.map((st) => {
    switch (st.k) {
      case "print": return { k: "print", e: exprIR(st.e) };
      case "error": return { k: "error", e: exprIR(st.e) };
      case "exit": return { k: "exit", e: st.e ? exprIR(st.e) : { k: "num", v: 0 } };
      case "set": return { k: "set", id: idOf(lex, st.name), e: exprIR(st.e) };
      case "if": return { k: "if", cond: st.cond.op ? { op: OPS[st.cond.op], l: exprIR(st.cond.l), r: exprIR(st.cond.r) } : { op: "truthy", l: exprIR(st.cond.l) }, then: blockIR(st.then), else: st.else ? blockIR(st.else) : [] };
      case "repeat": return { k: "repeat", n: exprIR(st.n), body: blockIR(st.body) };
    }
  });
  const version = app.version.split(".").length === 2 ? `${app.version}.0` : app.version;
  return {
    formatVersion: "0.1",
    kind: "cli",
    id: slug(app.name),
    name: app.name,
    version,
    description: app.description,
    sourceLanguage: ast.language,
    i18n: {
      msgs: Object.fromEntries(Object.entries(lex.raw.messages).filter(([k]) => k.startsWith("R_"))),
      words: Object.fromEntries([...Object.keys(CLI_TYPE), "V_TRUE", "V_FALSE"].map((id) => [id, lex.word(id)])),
    },
    commands: ast.commands.map((c) => ({
      id: idOf(lex, c.name),
      name: c.name,
      description: c.description,
      params: c.params.map((p) => {
        const type = CLI_TYPE[p.type];
        const id = idOf(lex, p.name);
        return { id, name: p.name, flag: id.replace(/_/g, "-"), kind: p.kind, type, ...(p.required ? { required: true } : {}), default: p.default ?? NEUTRAL[type] };
      }),
      action: blockIR(c.action),
    })),
  };
}

/* ───────── Interface publique ───────── */

export function formatDiagnostic(d, lex, file = "main.bk") {
  const sev = lex.msg(d.severity === "warning" ? "SEV_WARNING" : "SEV_ERROR");
  // Un diagnostic déjà publié par compile() porte son message final : on ne le reformate pas
  // (il n'a plus forcément ses paramètres, ce qui donnait « interface introuvable : «  » »).
  const text = typeof d.message === "string" && d.message ? d.message : lex.msg(d.code, d.params);
  return `${file}:${d.line}:${d.col} ${sev} : ${text}`;
}

/**
 * Compile un fichier .bk en projet BERKIOS (schéma 1.2).
 * @returns {{ ok:boolean, project?:object, diagnostics:Array, language?:string, lexicon:object }}
 */
export function compile(source, options = {}) {
  const parsed = parse(source, options);
  const diags = [...parsed.diagnostics];
  const lex = parsed.lexicon;
  let project, cli;
  // Tant qu'il reste des erreurs de syntaxe, on n'analyse pas le sens : cela évite des erreurs en cascade trompeuses.
  const syntaxOk = !diags.some((d) => d.severity === "error");
  if (parsed.ast && syntaxOk) {
    const info = analyze(parsed.ast, lex, diags);
    if (info && !diags.some((d) => d.severity === "error")) {
      if (info.isCli) cli = emitCli(parsed.ast, lex, options);
      else project = emit(parsed.ast, info, lex, options, diags);
    }
  }
  diags.sort((a, b) => a.line - b.line || a.col - b.col);
  const hasErrors = diags.some((d) => d.severity === "error");
  const diagnostics = diags.map((d) => ({ severity: d.severity, code: d.code, line: d.line, col: d.col, params: d.params, message: lex.msg(d.code, d.params) }));
  return { ok: !hasErrors && !!(project || cli), project: hasErrors ? undefined : project, cli: hasErrors ? undefined : cli, diagnostics, language: parsed.ast?.language, ast: parsed.ast, lexicon: lex };
}
