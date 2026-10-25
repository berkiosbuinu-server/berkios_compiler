/*
 * Exécution des applications BERKIOS en ligne de commande (représentation « cli » produite par le compilateur).
 *
 * Ce fichier est AUTONOME : aucun import. Il est copié tel quel dans les scripts créés par `berkios exporter`,
 * qui peuvent donc tourner avec Node.js seul. Tous les textes affichés viennent de `ir.i18n`, donc dans la
 * langue du fichier .bk d'origine.
 */

const DEFAULT_IO = { out: (s) => console.log(s), err: (s) => console.error(s) };
const MAX_STEPS = 5_000_000;
const TRUE_WORDS = ["true", "vrai", "oui", "yes", "1"];
const FALSE_WORDS = ["false", "faux", "non", "no", "0"];
const TYPE_WORD = { text: "T_TEXT", integer: "T_INT", decimal: "T_DECIMAL", boolean: "T_BOOL" };

class RunError extends Error {
  constructor(key, params = {}, usage = false) { super(key); this.key = key; this.params = params; this.usage = usage; }
}
class ExitSignal { constructor(code) { this.code = code; } }

const normId = (s) => String(s).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[\s-]+/g, "_");

/** Exécute l'application. Renvoie le code de sortie (0 = succès, 1 = erreur d'exécution, 2 = mauvaise utilisation). */
export function runCli(ir, argv, io = DEFAULT_IO) {
  const t = (key, params = {}) => String(ir.i18n.msgs[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => params[k] ?? "");
  const word = (id) => ir.i18n.words[id] ?? id;
  const typeName = (type) => word(TYPE_WORD[type]);
  const helpFlag = ir.sourceLanguage === "fr" ? "--aide" : "--help";
  const usage = (key, params) => new RunError(key, params, true);
  const state = { steps: 0 };

  /* ───── valeurs ───── */
  const show = (v) => (typeof v === "boolean" ? word(v ? "V_TRUE" : "V_FALSE") : typeof v === "number" ? String(Number(v.toPrecision(12))) : String(v));
  const isNumeric = (v) => typeof v === "number" || (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v));
  const toNum = (v) => {
    if (isNumeric(v)) return Number(v);
    throw new RunError("R_NOT_NUMBER", { value: show(v) });
  };
  const toBool = (v) => {
    if (typeof v === "boolean") return v;
    throw new RunError("R_NOT_BOOL", { value: show(v) });
  };

  /* ───── portées de variables ───── */
  const lookup = (scope, id) => {
    for (let s = scope; s; s = s.parent) if (s.vars.has(id)) return s.vars.get(id);
    throw new Error(`variable non définie : ${id}`); // empêché à la compilation
  };
  const assign = (scope, id, value) => {
    for (let s = scope; s; s = s.parent) if (s.vars.has(id)) { s.vars.set(id, value); return; }
    scope.vars.set(id, value);
  };

  /* ───── expressions ───── */
  const evalExpr = (e, scope) => {
    switch (e.k) {
      case "str": case "num": case "bool": return e.v;
      case "ref": return lookup(scope, e.id);
      case "cat": return e.parts.map((p) => show(evalExpr(p, scope))).join("");
      case "neg": return -toNum(evalExpr(e.e, scope));
      case "bin": {
        const l = toNum(evalExpr(e.l, scope)), r = toNum(evalExpr(e.r, scope));
        if (e.op === "+") return l + r;
        if (e.op === "-") return l - r;
        if (e.op === "*") return l * r;
        if (r === 0) throw new RunError("R_DIV_ZERO");
        return l / r;
      }
    }
    throw new Error(`expression inconnue : ${e.k}`);
  };
  const evalCond = (c, scope) => {
    const l = evalExpr(c.l, scope);
    if (c.op === "truthy") return toBool(l);
    const r = evalExpr(c.r, scope);
    const numeric = isNumeric(l) && isNumeric(r);
    const a = numeric ? Number(l) : show(l), b = numeric ? Number(r) : show(r);
    switch (c.op) {
      case "eq": return a === b;
      case "ne": return a !== b;
      case "lt": return a < b;
      case "gt": return a > b;
      case "le": return a <= b;
      default: return a >= b;
    }
  };

  /* ───── instructions ───── */
  const tick = () => { if (++state.steps > MAX_STEPS) throw new RunError("R_LOOP", { max: MAX_STEPS }); };
  const execBlock = (stmts, scope) => {
    for (const st of stmts) {
      tick();
      switch (st.k) {
        case "print": io.out(show(evalExpr(st.e, scope))); break;
        case "error": io.err(show(evalExpr(st.e, scope))); break;
        case "exit": {
          const code = toNum(evalExpr(st.e, scope));
          if (!Number.isInteger(code)) throw new RunError("R_EXIT_CODE");
          throw new ExitSignal(code);
        }
        case "set": assign(scope, st.id, evalExpr(st.e, scope)); break;
        case "if":
          execBlock(evalCond(st.cond, scope) ? st.then : st.else, { vars: new Map(), parent: scope });
          break;
        case "repeat": {
          const n = toNum(evalExpr(st.n, scope));
          if (!Number.isInteger(n)) throw new RunError("R_NOT_NUMBER", { value: show(n) });
          for (let i = 0; i < n; i++) { tick(); execBlock(st.body, { vars: new Map(), parent: scope }); }
          break;
        }
      }
    }
  };

  /* ───── aide ───── */
  const pad = (rows) => {
    const w = Math.max(...rows.map((r) => r[0].length));
    return rows.map(([a, b]) => `  ${a.padEnd(w)}  ${b}`.trimEnd());
  };
  const paramInfo = (p) => {
    const parts = [typeName(p.type)];
    if (p.required) parts.push(t("R_REQUIRED"));
    else if (p.kind === "option" && p.type !== "boolean") parts.push(`${t("R_DEFAULT")} ${show(p.default)}`);
    return parts.join(", ");
  };
  const helpApp = () => {
    const lines = [`${ir.name} ${ir.version}`];
    if (ir.description) lines.push(ir.description);
    lines.push("", `${t("R_USAGE")} : ${ir.id} <command> [options]`, "", `${t("R_COMMANDS")} :`, ...pad(ir.commands.map((c) => [c.id, c.description])));
    io.out(lines.join("\n"));
  };
  const helpCommand = (cmd) => {
    const single = ir.commands.length === 1;
    const args = cmd.params.filter((p) => p.kind === "argument");
    const opts = cmd.params.filter((p) => p.kind === "option");
    const usageLine = [ir.id, ...(single ? [] : [cmd.id]), ...args.map((p) => (p.required ? `<${p.id}>` : `[${p.id}]`)), ...opts.map((p) => (p.type === "boolean" ? `[--${p.flag}]` : `[--${p.flag} <${typeName(p.type)}>]`))].join(" ");
    const lines = [];
    if (cmd.description) lines.push(cmd.description, "");
    lines.push(`${t("R_USAGE")} : ${usageLine}`);
    if (args.length) lines.push("", `${t("R_ARGUMENTS")} :`, ...pad(args.map((p) => [p.id, paramInfo(p)])));
    if (opts.length) lines.push("", `${t("R_OPTIONS")} :`, ...pad(opts.map((p) => [`--${p.flag}`, paramInfo(p)])));
    io.out(lines.join("\n"));
  };

  /* ───── lecture de la ligne de commande ───── */
  const convert = (p, raw, label) => {
    const bad = () => usage("R_BAD_VALUE", { name: label, value: raw, type: typeName(p.type) });
    switch (p.type) {
      case "integer": if (!/^-?\d+$/.test(raw)) throw bad(); return Number(raw);
      case "decimal": if (!/^-?\d+(\.\d+)?$/.test(raw)) throw bad(); return Number(raw);
      case "boolean": {
        const v = String(raw).toLowerCase();
        if (TRUE_WORDS.includes(v)) return true;
        if (FALSE_WORDS.includes(v)) return false;
        throw bad();
      }
      default: return raw;
    }
  };

  const main = () => {
    let args = [...argv];
    if (args.includes("--version")) { io.out(`${ir.name} ${ir.version}`); return 0; }
    const wantsHelp = args.some((a) => a === "--aide" || a === "--help" || a === "-h");
    const first = args[0];
    let cmd = first && !first.startsWith("-") ? ir.commands.find((c) => normId(c.id) === normId(first)) : undefined;
    if (cmd) args = args.slice(1);
    else if (ir.commands.length === 1) cmd = ir.commands[0];
    else if (wantsHelp || !args.length) { helpApp(); return 0; }
    else if (first.startsWith("-")) throw usage("R_UNKNOWN_OPTION", { name: first });
    else throw usage("R_UNKNOWN_COMMAND", { name: first });
    if (wantsHelp) { helpCommand(cmd); return 0; }

    const values = new Map(), positional = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === "--") { positional.push(...args.slice(i + 1)); break; }
      if (!a.startsWith("--")) { positional.push(a); continue; }
      const eq = a.indexOf("=");
      const label = eq < 0 ? a : a.slice(0, eq);
      const inline = eq < 0 ? undefined : a.slice(eq + 1);
      const p = cmd.params.find((x) => x.kind === "option" && normId(x.flag) === normId(label.slice(2)));
      if (!p) throw usage("R_UNKNOWN_OPTION", { name: label });
      if (p.type === "boolean") values.set(p.id, inline === undefined ? true : convert(p, inline, label));
      else {
        let v = inline;
        if (v === undefined) { v = args[++i]; if (v === undefined) throw usage("R_MISSING_VALUE", { name: label }); }
        values.set(p.id, convert(p, v, label));
      }
    }
    const declared = cmd.params.filter((p) => p.kind === "argument");
    if (positional.length > declared.length) throw usage("R_TOO_MANY", { value: positional[declared.length] });
    declared.forEach((p, i) => {
      if (i < positional.length) values.set(p.id, convert(p, positional[i], p.name));
      else if (p.required) throw usage("R_MISSING_ARG", { name: p.name });
    });

    const vars = new Map(cmd.params.map((p) => [p.id, values.has(p.id) ? values.get(p.id) : p.default]));
    execBlock(cmd.action, { vars, parent: null });
    return 0;
  };

  try {
    return main();
  } catch (e) {
    if (e instanceof ExitSignal) return e.code;
    if (e instanceof RunError) {
      io.err(t(e.key, e.params));
      if (e.usage) io.err(`${t("R_HELP")} : ${ir.id} ${helpFlag}`);
      return e.usage ? 2 : 1;
    }
    throw e;
  }
}
