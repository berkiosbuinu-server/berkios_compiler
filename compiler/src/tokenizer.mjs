import { Diag } from "./diagnostics.mjs";
import { norm } from "./lexicon.mjs";

const WORD = /^[\p{L}_][\p{L}\p{N}_]*(?:-[\p{L}\p{N}_]+)*/u;
const NUMBER = /^-?\d+(?:\.\d+)*/;
const COLOR = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-zA-Z])/;
const CLOSERS = { '"': '"', "“": "”", "«": "»" };
const ESCAPES = { n: "\n", t: "\t", '"': '"', "\\": "\\" };

/** Découpe une ligne (sans son indentation) en jetons : word, string, number, color, sym, apos. */
export function tokenizeLine(text, line, indent) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const col = indent + i + 1;
    if (ch === " ") { i++; continue; }
    if (ch === "/" && text[i + 1] === "/") break; // commentaire jusqu'à la fin de la ligne
    if (CLOSERS[ch]) {
      const close = CLOSERS[ch];
      let j = i + 1, value = "", done = false;
      while (j < text.length) {
        if (text[j] === "\\" && j + 1 < text.length) { value += ESCAPES[text[j + 1]] ?? text[j + 1]; j += 2; continue; }
        if (text[j] === close) { done = true; break; }
        value += text[j++];
      }
      if (!done) throw new Diag("E_STRING", {}, line, col);
      // En typographie française, « texte » s'écrit avec des espaces (souvent insécables) à l'intérieur.
      if (ch === "«") value = value.replace(/^[\s\u00A0\u202F]+|[\s\u00A0\u202F]+$/g, "");
      out.push({ type: "string", value, line, col });
      i = j + 1;
      continue;
    }
    if (ch === "#") {
      const m = COLOR.exec(text.slice(i));
      if (!m) throw new Diag("E_EXPECT_COLOR", {}, line, col);
      out.push({ type: "color", value: m[0].toLowerCase(), line, col });
      i += m[0].length;
      continue;
    }
    const prev = text[i - 1];
    const m = (/\d/.test(ch) || (ch === "-" && /\d/.test(text[i + 1] ?? "") && (prev === undefined || prev === " ")))
      ? NUMBER.exec(text.slice(i)) : null;
    if (m) {
      out.push({ type: "number", value: m[0], num: /^-?\d+(?:\.\d+)?$/.test(m[0]) ? Number(m[0]) : NaN, line, col });
      i += m[0].length;
      continue;
    }
    const w = WORD.exec(text.slice(i));
    if (w) {
      out.push({ type: "word", value: w[0], norm: norm(w[0]), line, col });
      i += w[0].length;
      continue;
    }
    if (ch === "’" || ch === "'") { out.push({ type: "apos", value: ch, line, col }); i++; continue; }
    if (":,+-*/()".includes(ch)) { out.push({ type: "sym", value: ch, line, col }); i++; continue; }
    throw new Diag("E_CHAR", { char: ch }, line, col);
  }
  return out;
}

/** Reconstitue un nom (« Liste des produits ») à partir de jetons contigus, en gardant apostrophes et traits d'union. */
export function joinName(tokens) {
  let s = "";
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    const raw = t.type === "string" ? t.value : t.value;
    if (k > 0) {
      const p = tokens[k - 1];
      const glued = p.type === "apos" || t.type === "apos";
      s += glued ? "" : " ";
    }
    s += raw;
  }
  return s;
}
