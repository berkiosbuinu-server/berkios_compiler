/** Égalité profonde stricte pour des données simples (objets, tableaux, valeurs primitives) : aucune dépendance à Node. */
function isDeepStrictEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && isDeepStrictEqual(a[k], b[k]));
}
import { parse, stripLoc } from "./parser.mjs";
import { getLexicon } from "./lexicon.mjs";

const q = (s) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
const KIND_ID = { button: "W_BUTTON", label: "W_LABEL", input: "W_INPUT", checkbox: "W_CHECKBOX", table: "W_TABLE", panel: "W_PANEL" };

function printAction(a, lex) {
  const w = lex.word(a.type);
  switch (a.type) {
    case "A_OPEN": case "A_SHOW": case "A_HIDE": case "A_TOGGLE": return `${w} ${a.target}`;
    case "A_MESSAGE": return `${w} ${q(a.message)}`;
    case "A_REQUEST": return `${w} ${a.method} ${q(a.url)}${a.responseTarget ? ` ${lex.word("IN")} ${a.responseTarget}` : ""}`;
    default: return w;
  }
}

function printWidget(w, lex, depth) {
  const pad = "  ".repeat(depth), sub = "  ".repeat(depth + 1);
  const lines = [`${pad}${lex.word(KIND_ID[w.kind])}${w.name ? ` ${w.name}` : ""}${w.text != null ? ` ${q(w.text)}` : ""}`];
  const add = (s) => lines.push(sub + s);
  if (w.position) add(`${lex.word("POSITION")} ${w.position.x}, ${w.position.y}`);
  if (w.size) add(`${lex.word("SIZE")} ${w.size.width} ${lex.word("BY")} ${w.size.height}`);
  if (w.color) add(`${lex.word("COLOR")} ${w.color}`);
  if (w.background) add(`${lex.word("BACKGROUND")} ${w.background}`);
  if (w.textSize !== undefined) add(`${lex.word("TEXT_SIZE")} ${w.textSize}`);
  if (w.bold) add(lex.word("BOLD"));
  if (w.align) add(`${lex.word("ALIGN")} ${lex.word(w.align)}`);
  if (w.layout) add(`${lex.word("LAYOUT")} ${lex.word(w.layout)}`);
  if (w.required) add(lex.word("C_REQUIRED"));
  if (w.min !== undefined) add(`${lex.word("C_MIN")} ${w.min}`);
  if (w.max !== undefined) add(`${lex.word("C_MAX")} ${w.max}`);
  if (w.format) add(`${lex.word("FORMAT")} ${lex.word(w.format)}`);
  if (w.source) add(`${lex.word("SOURCE")} : ${w.source}`);
  if (w.columns) add(`${lex.word("COLUMNS")} : ${w.columns.join(", ")}`);
  if (w.cell) add(`${lex.word("CELL")} ${w.cell}`);
  if (w.sheet) add(`${lex.word("SHEET")} ${q(w.sheet)}`);
  if (w.onClick) add(`${lex.word("ON_CLICK")} : ${printAction(w.onClick, lex)}`);
  for (const c of w.children ?? []) lines.push(printWidget(c, lex, depth + 1));
  return lines.join("\n");
}


/* ── applications en ligne de commande ── */

function printExpr(e, lex, ctx = 0) {
  switch (e.k) {
    case "str": return q(e.v);
    case "num": return String(e.v);
    case "bool": return lex.word(e.v ? "V_TRUE" : "V_FALSE");
    case "ref": return e.name;
    case "neg": return `-${printExpr(e.e, lex, 4)}`;
    case "cat": { const t = e.parts.map((x) => printExpr(x, lex, 2)).join(` ${lex.word("CONCAT")} `); return ctx > 1 ? `(${t})` : t; }
    case "bin": {
      const prec = e.op === "+" || e.op === "-" ? 2 : 3;
      const t = `${printExpr(e.l, lex, prec)} ${e.op} ${printExpr(e.r, lex, prec + 1)}`;
      return prec < ctx ? `(${t})` : t;
    }
  }
}

function printStmts(stmts, lex, depth) {
  const pad = "  ".repeat(depth);
  const out = [];
  for (const st of stmts) {
    switch (st.k) {
      case "print": out.push(`${pad}${lex.word("S_PRINT")} ${printExpr(st.e, lex)}`); break;
      case "error": out.push(`${pad}${lex.word("S_ERROR")} ${printExpr(st.e, lex)}`); break;
      case "exit": out.push(st.e ? `${pad}${lex.word("S_EXIT")} ${printExpr(st.e, lex)}` : `${pad}${lex.raw.words.S_EXIT.at(-1)}`); break;
      case "set": out.push(`${pad}${lex.word("S_SET")} ${st.name} ${lex.word("AS")} ${printExpr(st.e, lex)}`); break;
      case "repeat": out.push(`${pad}${lex.word("S_REPEAT")} ${printExpr(st.n, lex)} ${lex.word("TIMES")}`, ...printStmts(st.body, lex, depth + 1)); break;
      case "if": {
        const cond = st.cond.op ? `${printExpr(st.cond.l, lex)} ${lex.word(st.cond.op)} ${printExpr(st.cond.r, lex)}` : printExpr(st.cond.l, lex);
        out.push(`${pad}${lex.word("S_IF")} ${cond} ${lex.word("THEN")}`, ...printStmts(st.then, lex, depth + 1));
        if (st.else) out.push(`${pad}${lex.word("S_ELSE")}`, ...printStmts(st.else, lex, depth + 1));
        break;
      }
    }
  }
  return out;
}

function printCommand(c, lex) {
  const lit = (v) => (typeof v === "boolean" ? lex.word(v ? "V_TRUE" : "V_FALSE") : typeof v === "string" ? q(v) : String(v));
  const l = [`\n${lex.word("COMMAND")} ${c.name}`];
  if (c.description) l.push(`  ${lex.word("DESCRIPTION")} ${q(c.description)}`);
  for (const p of c.params) {
    let line = `  ${lex.word(p.kind === "argument" ? "ARGUMENT" : "OPTION")} ${p.name} : ${lex.word(p.type)}`;
    if (p.required) line += `, ${lex.word("C_REQUIRED")}`;
    if (p.default !== undefined) line += `, ${lex.word("DEFAULT")} ${lit(p.default)}`;
    l.push(line);
  }
  if (c.action) l.push(`  ${lex.word("ACTION")}`, ...printStmts(c.action, lex, 2));
  return l.join("\n");
}

/** Écrit un AST dans la langue du lexique donné (forme canonique : pas de commentaires, mots-clés de première forme). */
export function printAst(ast, lex) {
  const out = [`${lex.word("LANGUAGE")} ${lex.raw.names[0]}`];
  for (const app of ast.applications) {
    const l = [`\n${lex.word("APPLICATION")} ${q(app.name)}`, `  ${lex.word("VERSION")} ${app.version}`];
    if (app.author) l.push(`  ${lex.word("AUTHOR")} ${q(app.author)}`);
    if (app.description) l.push(`  ${lex.word("DESCRIPTION")} ${q(app.description)}`);
    l.push(`  ${lex.word("APP_TYPE")} ${lex.word(app.appType)}`);
    if (app.platforms) l.push(`  ${lex.word("PLATFORMS")} ${app.platforms.join(", ")}`);
    l.push(`  ${lex.word("EDITION")} ${app.edition}`);
    out.push(l.join("\n"));
  }
  for (const m of ast.models) {
    const l = [`\n${lex.word("MODEL")} ${m.name}`];
    for (const f of m.fields) {
      let s = `  ${f.name} : ${lex.word(f.type)}`;
      if (f.unique) s += `, ${lex.word("C_UNIQUE")}`;
      if (f.required) s += `, ${lex.word("C_REQUIRED")}`;
      if (f.min !== undefined) s += `, ${lex.word("C_MIN")} ${f.min}`;
      if (f.max !== undefined) s += `, ${lex.word("C_MAX")} ${f.max}`;
      l.push(s);
    }
    out.push(l.join("\n"));
  }
  for (const c of ast.commands ?? []) out.push(printCommand(c, lex));
  for (const i of ast.interfaces) {
    const l = [`\n${lex.word("INTERFACE")} ${i.name}`];
    if (i.display) l.push(`  ${lex.word("DISPLAY")} ${lex.word(i.display)}`);
    if (i.title) l.push(`  ${lex.word("TITLE")} ${q(i.title)}`);
    if (i.size) l.push(`  ${lex.word("SIZE")} ${i.size.width} ${lex.word("BY")} ${i.size.height}`);
    if (i.background) l.push(`  ${lex.word("BACKGROUND")} ${i.background}`);
    if (i.theme) l.push(`  ${lex.word("THEME")} ${lex.word(i.theme)}`);
    if (i.items.length && l.length > 1) l.push("");
    for (const w of i.items) l.push(printWidget(w, lex, 1));
    out.push(l.join("\n"));
  }
  return out.join("\n") + "\n";
}

/**
 * Traduit un fichier .bk vers une autre langue de programmation, sans perte de sens.
 * Les commentaires ne sont pas conservés (le fichier est réécrit sous sa forme canonique).
 */
export function translate(source, toLanguage, options = {}) {
  const target = getLexicon(toLanguage);
  if (!target) return { ok: false, diagnostics: [{ severity: "error", code: "E_LANGUAGE_VALUE", line: 1, col: 1, message: `Unknown language: ${toLanguage}` }] };
  const parsed = parse(source, options);
  const errors = parsed.diagnostics.filter((d) => d.severity === "error");
  if (errors.length || !parsed.ast) {
    return { ok: false, diagnostics: parsed.diagnostics.map((d) => ({ severity: d.severity, code: d.code, line: d.line, col: d.col, message: parsed.lexicon.msg(d.code, d.params) })), lexicon: parsed.lexicon };
  }
  const text = printAst(parsed.ast, target);
  // Garde-fou : le texte traduit doit se relire dans la langue cible et redonner exactement le même programme.
  // (Un nom choisi par l'utilisateur peut devenir un mot-clé ou un mot vide dans l'autre langue.)
  const back = parse(text, { language: target.code });
  const sameProgram = (a, b) => isDeepStrictEqual({ ...stripLoc(a), language: "", declared: true }, { ...stripLoc(b), language: "", declared: true });
  const firstError = back.diagnostics.find((d) => d.severity === "error");
  if (firstError || !back.ast || !sameProgram(back.ast, parsed.ast)) {
    const detail = firstError ? `${firstError.line}: ${back.lexicon.msg(firstError.code, firstError.params)}` : "?";
    return { ok: false, diagnostics: [{ severity: "error", code: "E_TRANSLATE_UNSAFE", line: firstError?.line ?? 1, col: 1, message: parsed.lexicon.msg("E_TRANSLATE_UNSAFE", { detail }) }], lexicon: parsed.lexicon };
  }
  return { ok: true, text, from: parsed.ast.language, to: target.code, diagnostics: [] };
}
