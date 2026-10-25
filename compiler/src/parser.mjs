import { Diag, closest } from "./diagnostics.mjs";
import { tokenizeLine, joinName } from "./tokenizer.mjs";
import { allLexicons, availableLanguages, getLexicon, norm } from "./lexicon.mjs";

/* ───────── Grammaire : quels mots-clés sont permis dans quel contexte ───────── */

export const WIDGET_KINDS = { W_BUTTON: "button", W_LABEL: "label", W_INPUT: "input", W_CHECKBOX: "checkbox", W_TABLE: "table", W_PANEL: "panel" };
const KIND_IDS = Object.keys(WIDGET_KINDS);
const COMMON = ["POSITION", "SIZE", "COLOR", "BACKGROUND", "TEXT_SIZE", "BOLD", "ALIGN"];
export const PROPS_BY_KIND = {
  button: [...COMMON, "ON_CLICK", "CELL", "SHEET"],
  label: [...COMMON, "CELL", "SHEET"],
  input: [...COMMON, "C_REQUIRED", "C_MIN", "C_MAX", "FORMAT", "CELL", "SHEET"],
  checkbox: [...COMMON, "CELL", "SHEET"],
  table: [...COMMON, "SOURCE", "COLUMNS"],
  panel: [...COMMON, "LAYOUT"],
};
export const CTX = {
  top: ["LANGUAGE", "APPLICATION", "MODEL", "INTERFACE", "RULE", "COMMAND"],
  app: ["VERSION", "APP_TYPE", "AUTHOR", "DESCRIPTION", "PLATFORMS", "EDITION"],
  appType: ["TYPE_INTERFACE", "TYPE_EXCEL", "TYPE_COMMAND"],
  fieldType: ["T_TEXT", "T_INT", "T_DECIMAL", "T_AMOUNT", "T_DATE", "T_BOOL"],
  constraint: ["C_UNIQUE", "C_REQUIRED", "C_MIN", "C_MAX"],
  iface: ["TITLE", "SIZE", "BACKGROUND", "THEME", "DISPLAY", ...KIND_IDS],
  theme: ["THEME_LIGHT", "THEME_DARK"],
  display: ["DISP_PAGE", "DISP_MODAL", "DISP_DRAWER"],
  align: ["ALIGN_LEFT", "ALIGN_CENTER", "ALIGN_RIGHT"],
  layout: ["LAYOUT_ROW", "LAYOUT_COLUMN"],
  format: ["FMT_TEXT", "FMT_EMAIL", "FMT_NUMBER", "FMT_DATE", "FMT_TIME", "FMT_PHONE", "FMT_URL"],
  command: ["DESCRIPTION", "ARGUMENT", "OPTION", "ACTION"],
  cliType: ["T_TEXT", "T_INT", "T_DECIMAL", "T_BOOL"],
  argConstraint: ["C_REQUIRED"],
  optConstraint: ["DEFAULT"],
  stmt: ["S_PRINT", "S_ERROR", "S_EXIT", "S_SET", "S_IF", "S_ELSE", "S_REPEAT"],
  cmp: ["CMP_EQ", "CMP_NE", "CMP_LT", "CMP_GT", "CMP_LE", "CMP_GE"],
  bool: ["V_TRUE", "V_FALSE"],
  action: ["A_OPEN", "A_CLOSE", "A_MESSAGE", "A_SHOW", "A_HIDE", "A_TOGGLE", "A_SUBMIT", "A_RESET", "A_REQUEST", "A_READ_EXCEL", "A_WRITE_EXCEL"],
};
export const widgetContext = (kind) => [...PROPS_BY_KIND[kind], ...(kind === "panel" ? KIND_IDS : [])];

const PLATFORM_NAMES = ["windows", "macos", "linux", "android", "ios", "excel"];
const EDITION_NAMES = ["free", "pro", "premium"];
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const CELL_RE = /^[A-Za-z]{1,3}[1-9][0-9]{0,6}(:[A-Za-z]{1,3}[1-9][0-9]{0,6})?$/;

/* ───────── 1. Lignes et indentation → arbre de nœuds ───────── */

function buildTree(source, diags) {
  const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/);
  const roots = [];
  const stack = []; // { node, level }
  let prevLevel = 0;
  lines.forEach((text, idx) => {
    const lineNo = idx + 1;
    if (!text.trim()) return;
    const lead = /^[ \t]*/.exec(text)[0];
    try {
      if (lead.includes("\t")) throw new Diag("E_TAB", {}, lineNo, 1);
      const body = text.slice(lead.length);
      if (body.startsWith("//")) return;
      if (lead.length % 2 !== 0) throw new Diag("E_INDENT", {}, lineNo, 1);
      const level = lead.length / 2;
      if (level > prevLevel + 1) throw new Diag("E_INDENT", {}, lineNo, 1);
      const tokens = tokenizeLine(body, lineNo, lead.length);
      if (!tokens.length) return;
      const node = { line: lineNo, col: lead.length + 1, tokens, children: [] };
      while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
      (stack.length ? stack[stack.length - 1].node.children : roots).push(node);
      stack.push({ node, level });
      prevLevel = level;
    } catch (e) {
      if (!(e instanceof Diag)) throw e;
      diags.push(e);
    }
  });
  return roots;
}

/* ───────── 2. Détection de la langue du fichier ───────── */

function detectLanguage(roots, preferred, diags) {
  const first = roots[0];
  if (first) {
    for (const lex of allLexicons()) {
      const m = lex.match(first.tokens, 0, ["LANGUAGE"]);
      if (!m) continue;
      const value = joinName(first.tokens.slice(m.end).filter((t) => !(t.type === "sym" && t.value === ":")));
      if (!lex.languageMatches(value)) {
        diags.push(new Diag("E_LANGUAGE_VALUE", { value, available: availableLanguages().join(", ") }, first.line, first.col));
      }
      return { lex, declared: true, node: first };
    }
  }
  const lex = preferred ? getLexicon(preferred) : null;
  return { lex, declared: false, node: null };
}

/* ───────── 3. Analyse syntaxique ───────── */

function makeParser(lex, diags) {
  const err = (code, params, at) => new Diag(code, params, at?.line ?? 0, at?.col ?? 0);
  const others = allLexicons().filter((l) => l.code !== lex.code);

  function unknown(node, toks, i, ids) {
    const t = toks[i] ?? node;
    const word = joinName(toks.slice(i, i + 1)) || "?";
    for (const o of others) {
      const m = o.match(toks, i, Object.keys(o.raw.words));
      if (m) return err("E_MIXED_LANGUAGE", { word: joinName(toks.slice(i, m.end)), other: o.msg("LANG_OF"), lang: lex.msg("LANG_OF") }, t);
    }
    const suggestion = closest(norm(word), ids.map((id) => ({ key: norm(lex.word(id)), label: lex.word(id) })));
    return err("E_UNKNOWN_KEYWORD", { word, hint: suggestion ? lex.msg("E_HINT", { suggestion }) : "" }, t);
  }

  const skipColon = (toks, i) => (toks[i]?.type === "sym" && toks[i].value === ":" ? i + 1 : i);
  const expectEnd = (toks, i) => { if (i < toks.length) throw err("E_EXTRA", { text: joinName(toks.slice(i)) }, toks[i]); };

  const readString = (node, toks, i) => {
    i = skipColon(toks, i);
    const t = toks[i];
    if (t?.type !== "string") throw err("E_EXPECT_STRING", {}, t ?? node);
    return { value: t.value, end: i + 1 };
  };
  const valueString = (node, toks, i) => { const r = readString(node, toks, i); expectEnd(toks, r.end); return r.value; };

  const readName = (node, toks, i, stopAtComma = false) => {
    let j = i;
    while (j < toks.length && (["word", "number", "apos"].includes(toks[j].type))) j++;
    let part = toks.slice(i, j);
    while (part.length && part[0].type === "word" && lex.isStop(part[0].value)) part = part.slice(1);
    if (!part.length) throw err("E_EXPECT_NAME", {}, toks[i] ?? node);
    return { value: joinName(part), end: j };
  };
  const valueName = (node, toks, i) => { const r = readName(node, toks, skipColon(toks, i)); expectEnd(toks, r.end); return r.value; };

  const valueNumbers = (node, toks, i, count) => {
    i = skipColon(toks, i);
    const nums = [];
    for (; i < toks.length; i++) {
      const t = toks[i];
      if (t.type === "number" && Number.isFinite(t.num)) { nums.push(t.num); continue; }
      if (t.type === "sym" && t.value === ",") continue;
      if (t.type === "word" && lex.match(toks, i, ["BY"])) continue;
      throw err("E_EXPECT_NUMBER", { count }, t);
    }
    if (nums.length !== count) throw err("E_EXPECT_NUMBER", { count }, toks[i] ?? node);
    return nums;
  };
  const valueNumber = (node, toks, i) => valueNumbers(node, toks, i, 1)[0];

  const valueColor = (node, toks, i) => {
    i = skipColon(toks, i);
    const t = toks[i];
    if (t?.type === "color") { expectEnd(toks, i + 1); return t.value; }
    if (t?.type === "word" && t.norm === "transparent") { expectEnd(toks, i + 1); return "transparent"; }
    throw err("E_EXPECT_COLOR", {}, t ?? node);
  };

  const valueEnum = (node, toks, i, ids) => {
    i = skipColon(toks, i);
    const m = lex.match(toks, i, ids);
    if (!m) throw err("E_EXPECT_VALUE", { values: ids.map((id) => lex.word(id)).join(", ") }, toks[i] ?? node);
    expectEnd(toks, m.end);
    return m.id;
  };

  const valueList = (node, toks, i) => {
    i = skipColon(toks, i);
    const items = [];
    while (true) {
      const r = readName(node, toks, i);
      items.push(r.value);
      i = r.end;
      if (toks[i]?.type === "sym" && toks[i].value === ",") { i++; continue; }
      break;
    }
    expectEnd(toks, i);
    return items;
  };

  const noChildren = (node) => { if (node.children.length) throw err("E_NO_CHILDREN_ALLOWED", {}, node.children[0]); };

  /** Exécute `fn` pour chaque enfant ; une erreur est notée puis on continue avec la ligne suivante. */
  const each = (node, fn) => {
    for (const child of node.children) {
      try { fn(child); } catch (e) { if (!(e instanceof Diag)) throw e; diags.push(e); }
    }
  };

  /* ── actions ── */
  function parseAction(node, toks, i) {
    const m = lex.match(toks, i, CTX.action);
    if (!m) throw unknown(node, toks, i, CTX.action);
    const a = { type: m.id, line: node.line };
    switch (m.id) {
      case "A_OPEN": case "A_SHOW": case "A_HIDE": case "A_TOGGLE":
        a.target = valueName(node, toks, m.end); break;
      case "A_MESSAGE":
        a.message = valueString(node, toks, m.end); break;
      case "A_REQUEST": {
        const mt = toks[m.end];
        if (!mt || mt.type !== "word" || !METHODS.includes(mt.value.toUpperCase())) throw err("E_EXPECT_VALUE", { values: METHODS.join(", ") }, mt ?? node);
        a.method = mt.value.toUpperCase();
        const u = readString(node, toks, m.end + 1);
        a.url = u.value;
        if (u.end < toks.length) {
          const into = lex.match(toks, u.end, ["IN"]);
          if (!into) throw err("E_EXTRA", { text: joinName(toks.slice(u.end)) }, toks[u.end]);
          a.responseTarget = valueName(node, toks, into.end);
        }
        break;
      }
      default: expectEnd(toks, m.end);
    }
    return a;
  }

  /* ── composants ── */
  function parseWidget(node, kindId, allowedKinds = []) {
    const toks = node.tokens;
    const m = lex.match(toks, 0, [kindId]);
    const kind = WIDGET_KINDS[kindId];
    let j = m.end;
    const nameStart = j;
    while (j < toks.length && ["word", "number", "apos"].includes(toks[j].type)) j++;
    let nameToks = toks.slice(nameStart, j);
    while (nameToks.length && nameToks[0].type === "word" && lex.isStop(nameToks[0].value)) nameToks = nameToks.slice(1);
    let text = null;
    if (toks[j]?.type === "string") { text = toks[j].value; j++; }
    expectEnd(toks, j);
    const w = { kind, name: nameToks.length ? joinName(nameToks) : null, text, line: node.line, children: [] };
    const seen = new Set();
    const ctxIds = widgetContext(kind);
    each(node, (child) => {
      const ct = child.tokens;
      const pm = lex.match(ct, 0, ctxIds);
      if (!pm) throw unknown(child, ct, 0, ctxIds);
      if (WIDGET_KINDS[pm.id]) { w.children.push(parseWidget(child, pm.id)); return; }
      if (seen.has(pm.id)) throw err("E_PROP_TWICE", { word: pm.raw }, child);
      seen.add(pm.id);
      const i = pm.end;
      switch (pm.id) {
        case "POSITION": { const [x, y] = valueNumbers(child, ct, i, 2); w.position = { x, y }; noChildren(child); break; }
        case "SIZE": { const [width, height] = valueNumbers(child, ct, i, 2); w.size = { width, height }; noChildren(child); break; }
        case "COLOR": w.color = valueColor(child, ct, i); noChildren(child); break;
        case "BACKGROUND": w.background = valueColor(child, ct, i); noChildren(child); break;
        case "TEXT_SIZE": w.textSize = valueNumber(child, ct, i); noChildren(child); break;
        case "BOLD": expectEnd(ct, i); noChildren(child); w.bold = true; break;
        case "ALIGN": w.align = valueEnum(child, ct, i, CTX.align); noChildren(child); break;
        case "LAYOUT": w.layout = valueEnum(child, ct, i, CTX.layout); noChildren(child); break;
        case "C_REQUIRED": expectEnd(ct, i); noChildren(child); w.required = true; break;
        case "C_MIN": w.min = valueNumber(child, ct, i); noChildren(child); break;
        case "C_MAX": w.max = valueNumber(child, ct, i); noChildren(child); break;
        case "FORMAT": w.format = valueEnum(child, ct, i, CTX.format); noChildren(child); break;
        case "SOURCE": w.source = valueName(child, ct, i); noChildren(child); break;
        case "COLUMNS": w.columns = valueList(child, ct, i); noChildren(child); break;
        case "CELL": {
          let k = skipColon(ct, i);
          let addr = "";
          while (k < ct.length && (ct[k].type === "word" || ct[k].type === "number" || (ct[k].type === "sym" && ct[k].value === ":"))) addr += ct[k++].value;
          expectEnd(ct, k);
          if (!CELL_RE.test(addr)) throw err("E_BAD_CELL", { value: addr }, ct[i] ?? child);
          w.cell = addr.toUpperCase(); noChildren(child); break;
        }
        case "SHEET": {
          const k = skipColon(ct, i);
          if (ct[k]?.type === "string") { expectEnd(ct, k + 1); w.sheet = ct[k].value; }
          else w.sheet = valueName(child, ct, i);
          noChildren(child); break;
        }
        case "ON_CLICK": {
          const k = skipColon(ct, i);
          if (k < ct.length) { noChildren(child); w.onClick = parseAction(child, ct, k); }
          else {
            if (child.children.length !== 1) throw err("E_ONE_ACTION", {}, child);
            const actionNode = child.children[0];
            if (actionNode.children.length) throw err("E_NO_CHILDREN_ALLOWED", {}, actionNode.children[0]);
            w.onClick = parseAction(actionNode, actionNode.tokens, 0);
          }
          break;
        }
      }
    });
    return w;
  }

  /* ── blocs de premier niveau ── */
  function parseApplication(node) {
    const toks = node.tokens;
    const m = lex.match(toks, 0, ["APPLICATION"]);
    const app = { name: "", version: "1.0", appType: "TYPE_INTERFACE", author: "", description: "", platforms: null, edition: "pro", line: node.line };
    const i = m.end;
    app.name = toks[i]?.type === "string" ? (expectEnd(toks, i + 1), toks[i].value) : valueName(node, toks, i);
    const seen = new Set();
    each(node, (child) => {
      const ct = child.tokens;
      const pm = lex.match(ct, 0, CTX.app);
      if (!pm) throw unknown(child, ct, 0, CTX.app);
      if (seen.has(pm.id)) throw err("E_PROP_TWICE", { word: pm.raw }, child);
      seen.add(pm.id);
      noChildren(child);
      const k = skipColon(ct, pm.end);
      switch (pm.id) {
        case "VERSION": {
          const t = ct[k];
          if (!t || t.type !== "number" || !/^\d+(\.\d+){1,2}$/.test(t.value)) throw err("E_BAD_VERSION", { value: t?.value ?? "" }, t ?? child);
          expectEnd(ct, k + 1); app.version = t.value; break;
        }
        case "APP_TYPE": app.appType = valueEnum(child, ct, pm.end, CTX.appType); break;
        case "AUTHOR": app.author = valueString(child, ct, pm.end); break;
        case "DESCRIPTION": app.description = valueString(child, ct, pm.end); break;
        case "PLATFORMS": {
          const names = valueList(child, ct, pm.end).map((n) => n.toLowerCase());
          for (const n of names) if (!PLATFORM_NAMES.includes(n)) throw err("E_EXPECT_VALUE", { values: PLATFORM_NAMES.join(", ") }, ct[k]);
          app.platforms = names; break;
        }
        case "EDITION": {
          const t = ct[k];
          if (!t || t.type !== "word" || !EDITION_NAMES.includes(t.norm)) throw err("E_EXPECT_VALUE", { values: EDITION_NAMES.join(", ") }, t ?? child);
          expectEnd(ct, k + 1); app.edition = t.norm; break;
        }
      }
    });
    return app;
  }

  function parseModel(node) {
    const toks = node.tokens;
    const m = lex.match(toks, 0, ["MODEL"]);
    const model = { name: valueName(node, toks, m.end), fields: [], line: node.line };
    each(node, (child) => {
      noChildren(child);
      const ct = child.tokens;
      const colon = ct.findIndex((t) => t.type === "sym" && t.value === ":");
      if (colon < 0) throw err("E_EXPECT_COLON", {}, ct[ct.length - 1]);
      const nameToks = ct.slice(0, colon);
      if (!nameToks.length || nameToks.some((t) => !["word", "number", "apos"].includes(t.type))) throw err("E_EXPECT_NAME", {}, nameToks[0] ?? ct[0]);
      const field = { name: joinName(nameToks), line: child.line };
      const tm = lex.match(ct, colon + 1, CTX.fieldType);
      if (!tm) throw err("E_EXPECT_TYPE", {}, ct[colon + 1] ?? child);
      field.type = tm.id;
      let i = tm.end;
      while (i < ct.length) {
        if (!(ct[i].type === "sym" && ct[i].value === ",")) throw err("E_EXTRA", { text: joinName(ct.slice(i)) }, ct[i]);
        const cm = lex.match(ct, i + 1, CTX.constraint);
        if (!cm) throw unknown(child, ct, i + 1, CTX.constraint);
        if (cm.id === "C_UNIQUE") { field.unique = true; i = cm.end; }
        else if (cm.id === "C_REQUIRED") { field.required = true; i = cm.end; }
        else {
          const t = ct[cm.end];
          if (!t || t.type !== "number" || !Number.isFinite(t.num)) throw err("E_EXPECT_NUMBER", { count: 1 }, t ?? child);
          field[cm.id === "C_MIN" ? "min" : "max"] = t.num; i = cm.end + 1;
        }
      }
      model.fields.push(field);
    });
    return model;
  }

  function parseInterface(node) {
    const toks = node.tokens;
    const m = lex.match(toks, 0, ["INTERFACE"]);
    const iface = { name: valueName(node, toks, m.end), items: [], line: node.line };
    const seen = new Set();
    each(node, (child) => {
      const ct = child.tokens;
      const pm = lex.match(ct, 0, CTX.iface);
      if (!pm) throw unknown(child, ct, 0, CTX.iface);
      if (WIDGET_KINDS[pm.id]) { iface.items.push(parseWidget(child, pm.id)); return; }
      if (seen.has(pm.id)) throw err("E_PROP_TWICE", { word: pm.raw }, child);
      seen.add(pm.id);
      noChildren(child);
      switch (pm.id) {
        case "TITLE": iface.title = valueString(child, ct, pm.end); break;
        case "SIZE": { const [width, height] = valueNumbers(child, ct, pm.end, 2); iface.size = { width, height }; break; }
        case "BACKGROUND": iface.background = valueColor(child, ct, pm.end); break;
        case "THEME": iface.theme = valueEnum(child, ct, pm.end, CTX.theme); break;
        case "DISPLAY": iface.display = valueEnum(child, ct, pm.end, CTX.display); break;
      }
    });
    return iface;
  }


  /* ── applications en ligne de commande : expressions ── */
  const isSym = (t, v) => t?.type === "sym" && t.value === v;

  function parseExpr(node, toks) {
    let i = 0;
    const fail = (at) => err("E_EXPECT_EXPR", {}, at ?? toks[i] ?? node);
    function concat() {
      const parts = [arith()];
      while (i < toks.length) {
        const m = toks[i].type === "word" ? lex.match(toks, i, ["CONCAT"]) : null;
        if (!m) break;
        i = m.end;
        parts.push(arith());
      }
      return parts.length > 1 ? { k: "cat", parts } : parts[0];
    }
    function arith() {
      let l = term();
      while (isSym(toks[i], "+") || isSym(toks[i], "-")) { const op = toks[i++].value; l = { k: "bin", op, l, r: term() }; }
      return l;
    }
    function term() {
      let l = factor();
      while (isSym(toks[i], "*") || isSym(toks[i], "/")) { const op = toks[i++].value; l = { k: "bin", op, l, r: factor() }; }
      return l;
    }
    function factor() {
      const t = toks[i];
      if (!t) throw fail(node);
      if (t.type === "string") { i++; return { k: "str", v: t.value }; }
      if (t.type === "number") { if (!Number.isFinite(t.num)) throw fail(t); i++; return { k: "num", v: t.num }; }
      if (isSym(t, "(")) {
        i++;
        const e = concat();
        if (!isSym(toks[i], ")")) throw fail(toks[i] ?? t);
        i++;
        return e;
      }
      if (isSym(t, "-")) {
        i++;
        const f = factor();
        return f.k === "num" ? { k: "num", v: -f.v } : { k: "neg", e: f };
      }
      let j = i;
      while (j < toks.length && (toks[j].type === "word" || toks[j].type === "apos") && !(toks[j].type === "word" && lex.match(toks, j, ["CONCAT"]))) j++;
      let run = toks.slice(i, j);
      while (run.length && run[0].type === "word" && lex.isStop(run[0].value)) run = run.slice(1);
      if (!run.length) throw fail(t);
      i = j;
      if (run.length === 1) {
        const b = lex.match(run, 0, CTX.bool);
        if (b) return { k: "bool", v: b.id === "V_TRUE" };
      }
      return { k: "ref", name: joinName(run) };
    }
    const e = concat();
    if (i < toks.length) throw err("E_EXTRA", { text: joinName(toks.slice(i)) }, toks[i]);
    return e;
  }

  /** Cherche, dans toks[from..], le premier mot-clé de `ids` ; renvoie { index, m } ou null. */
  function findKeyword(toks, from, ids, mustEnd = false) {
    for (let j = from; j < toks.length; j++) {
      if (toks[j].type !== "word") continue;
      const m = lex.match(toks, j, ids);
      if (m && (!mustEnd || m.end === toks.length)) return { index: j, m };
    }
    return null;
  }

  function parseBlock(node) {
    const stmts = [];
    for (const child of node.children) {
      try {
        const st = parseStatement(child, stmts);
        if (st) stmts.push(st);
      } catch (e) { if (!(e instanceof Diag)) throw e; diags.push(e); }
    }
    return stmts;
  }

  function parseStatement(node, previous) {
    const toks = node.tokens;
    const m = lex.match(toks, 0, CTX.stmt);
    if (!m) throw unknown(node, toks, 0, CTX.stmt);
    const base = { line: node.line };
    const sub = toks.slice(m.end);
    switch (m.id) {
      case "S_PRINT": noKids(node); return { k: "print", e: parseExpr(node, sub), ...base };
      case "S_ERROR": noKids(node); return { k: "error", e: parseExpr(node, sub), ...base };
      case "S_EXIT":
        noKids(node);
        return { k: "exit", e: sub.length ? parseExpr(node, sub) : null, ...base };
      case "S_SET": {
        noKids(node);
        const as = findKeyword(toks, m.end, ["AS"]);
        if (!as) throw err("E_EXPECT_WORD", { word: lex.word("AS") }, toks[toks.length - 1] ?? node);
        const nameToks = toks.slice(m.end, as.index);
        const r = readName(node, nameToks, 0);
        if (r.end < nameToks.length) throw err("E_EXTRA", { text: joinName(nameToks.slice(r.end)) }, nameToks[r.end]);
        return { k: "set", name: r.value, e: parseExpr(node, toks.slice(as.m.end)), ...base };
      }
      case "S_REPEAT": {
        const times = findKeyword(toks, m.end, ["TIMES"], true);
        if (!times) throw err("E_EXPECT_WORD", { word: lex.word("TIMES") }, toks[toks.length - 1] ?? node);
        return { k: "repeat", n: parseExpr(node, toks.slice(m.end, times.index)), body: parseBlock(node), ...base };
      }
      case "S_IF": {
        const then = findKeyword(toks, m.end, ["THEN"], true);
        if (!then) throw err("E_EXPECT_WORD", { word: lex.word("THEN") }, toks[toks.length - 1] ?? node);
        const condToks = toks.slice(m.end, then.index);
        const cmp = findKeyword(condToks, 0, CTX.cmp);
        const cond = cmp
          ? { op: cmp.m.id, l: parseExpr(node, condToks.slice(0, cmp.index)), r: parseExpr(node, condToks.slice(cmp.m.end)) }
          : { op: null, l: parseExpr(node, condToks) };
        return { k: "if", cond, then: parseBlock(node), else: null, ...base };
      }
      case "S_ELSE": {
        const last = previous[previous.length - 1];
        if (!last || last.k !== "if" || last.else) throw err("E_ELSE_ALONE", { word: m.raw, kw: lex.word("S_IF") }, node);
        if (sub.length) throw err("E_EXTRA", { text: joinName(sub) }, sub[0]);
        last.else = parseBlock(node);
        return null;
      }
    }
  }
  const noKids = (node) => { if (node.children.length) throw err("E_NO_CHILDREN_ALLOWED", {}, node.children[0]); };

  /* ── commande ── */
  function parseCommand(node) {
    const toks = node.tokens;
    const m = lex.match(toks, 0, ["COMMAND"]);
    const cmd = { name: valueName(node, toks, m.end), description: "", params: [], action: null, line: node.line };
    each(node, (child) => {
      const ct = child.tokens;
      const pm = lex.match(ct, 0, CTX.command);
      if (!pm) throw unknown(child, ct, 0, CTX.command);
      switch (pm.id) {
        case "DESCRIPTION": noKids(child); cmd.description = valueString(child, ct, pm.end); break;
        case "ACTION":
          if (cmd.action) throw err("E_PROP_TWICE", { word: pm.raw }, child);
          expectEnd(ct, pm.end);
          cmd.action = parseBlock(child);
          break;
        default: { // ARGUMENT ou OPTION : « nom : type, contrainte »
          noKids(child);
          const colon = ct.findIndex((t, idx) => idx >= pm.end && isSym(t, ":"));
          if (colon < 0) throw err("E_EXPECT_COLON", {}, ct[ct.length - 1]);
          const nameToks = ct.slice(pm.end, colon);
          if (!nameToks.length || nameToks.some((t) => !["word", "number", "apos"].includes(t.type))) throw err("E_EXPECT_NAME", {}, nameToks[0] ?? ct[pm.end] ?? child);
          const p = { kind: pm.id === "ARGUMENT" ? "argument" : "option", name: joinName(nameToks), line: child.line };
          const tm = lex.match(ct, colon + 1, CTX.cliType);
          if (!tm) throw err("E_EXPECT_VALUE", { values: CTX.cliType.map((id) => lex.word(id)).join(", ") }, ct[colon + 1] ?? child);
          p.type = tm.id;
          let i = tm.end;
          const allowed = p.kind === "argument" ? CTX.argConstraint : CTX.optConstraint;
          while (i < ct.length) {
            if (!isSym(ct[i], ",")) throw err("E_EXTRA", { text: joinName(ct.slice(i)) }, ct[i]);
            const cm = lex.match(ct, i + 1, allowed);
            if (!cm) throw unknown(child, ct, i + 1, allowed);
            if (cm.id === "C_REQUIRED") { p.required = true; i = cm.end; continue; }
            const v = ct[cm.end], neg = isSym(v, "-") && ct[cm.end + 1]?.type === "number";
            const lit = neg ? ct[cm.end + 1] : v;
            if (!lit) throw err("E_EXPECT_EXPR", {}, ct[cm.end] ?? child);
            if (lit.type === "string") p.default = lit.value;
            else if (lit.type === "number" && Number.isFinite(lit.num)) p.default = neg ? -lit.num : lit.num;
            else if (lit.type === "word" && lex.match([lit], 0, CTX.bool)) p.default = lex.match([lit], 0, CTX.bool).id === "V_TRUE";
            else throw err("E_EXPECT_EXPR", {}, lit);
            i = cm.end + (neg ? 2 : 1);
          }
          cmd.params.push(p);
        }
      }
    });
    return cmd;
  }

  return { parseApplication, parseModel, parseInterface, parseCommand, unknown, err };
}

/**
 * Analyse un fichier .bk. Renvoie { ast, diagnostics, lexicon }.
 * options.language : langue par défaut (configuration) quand le fichier ne déclare pas la sienne.
 */
export function parse(source, options = {}) {
  const diags = [];
  const roots = buildTree(source, diags);
  const det = detectLanguage(roots, options.language, diags);
  if (!det.lex) {
    const fallback = getLexicon(options.messagesLanguage ?? "en");
    diags.push(new Diag("E_NO_LANGUAGE", {}, 1, 1));
    return { ast: null, diagnostics: diags, lexicon: fallback };
  }
  const lex = det.lex;
  const p = makeParser(lex, diags);
  const ast = { language: lex.code, declared: det.declared, applications: [], models: [], interfaces: [], commands: [] };
  roots.forEach((node, idx) => {
    if (node === det.node) { if (node.children.length) diags.push(new Diag("E_NO_CHILDREN_ALLOWED", {}, node.children[0].line, node.children[0].col)); return; }
    try {
      const m = lex.match(node.tokens, 0, CTX.top);
      if (!m) throw p.unknown(node, node.tokens, 0, CTX.top.filter((id) => id !== "LANGUAGE"));
      switch (m.id) {
        case "LANGUAGE": throw p.err("E_LANGUAGE_LINE", {}, node);
        case "APPLICATION": ast.applications.push(p.parseApplication(node)); break;
        case "MODEL": ast.models.push(p.parseModel(node)); break;
        case "INTERFACE": ast.interfaces.push(p.parseInterface(node)); break;
        case "COMMAND": ast.commands.push(p.parseCommand(node)); break;
        case "RULE": throw p.err("E_NOT_YET", { word: m.raw }, node);
      }
    } catch (e) {
      if (!(e instanceof Diag)) throw e;
      diags.push(e);
    }
  });
  diags.sort((a, b) => a.line - b.line || a.col - b.col);
  return { ast, diagnostics: diags, lexicon: lex };
}

/** AST sans les positions : sert à comparer deux fichiers écrits dans des langues différentes. */
export function stripLoc(value) {
  if (Array.isArray(value)) return value.map(stripLoc);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) if (k !== "line") out[k] = stripLoc(v);
    return out;
  }
  return value;
}
