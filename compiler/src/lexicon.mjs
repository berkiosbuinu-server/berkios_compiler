import { LEXICON_DATA } from "./lexicons/index.mjs";

/** Normalisation pour la comparaison : minuscules, sans accents. « Modèle », « modele » et « MODELE » sont équivalents. */
export const norm = (s) => String(s).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export function availableLanguages() {
  return Object.keys(LEXICON_DATA).sort();
}

const cache = new Map();
export function getLexicon(code) {
  if (!cache.has(code)) {
    const raw = LEXICON_DATA[code];
    if (!raw) return null;
    cache.set(code, new Lexicon(raw));
  }
  return cache.get(code);
}
export const allLexicons = () => availableLanguages().map(getLexicon);

export class Lexicon {
  constructor(raw) {
    this.raw = raw;
    this.code = raw.code;
    this.name = raw.name;
    this.names = raw.names.map(norm);
    this.stop = new Set(raw.stopwords.map(norm));
    this.phraseList = [];
    for (const [id, aliases] of Object.entries(raw.words)) {
      for (const alias of aliases) {
        const raw = alias.split(/[\s’']+/).map(norm);
        const seq = raw.filter((w) => !this.stop.has(w));
        let trailing = 0; // mots vides en fin de mot-clé (« est différent de ») : à consommer aussi dans le texte
        for (let k = raw.length - 1; k >= 0 && this.stop.has(raw[k]); k--) trailing++;
        this.phraseList.push({ id, raw: alias, seq, trailing });
      }
    }
    this.byIds = new Map();
  }

  isStop(word) { return this.stop.has(norm(word)); }

  /** Forme « clé » d'un nom : sans accents, sans mots vides ; sert à comparer les références. */
  key(text) {
    return norm(text).split(/[^\p{L}\p{N}_-]+/u).filter((w) => w && !this.stop.has(w)).join(" ");
  }

  /** Mot-clé canonique (première forme) : c'est celui que le formateur et `traduire` écrivent. */
  word(id) { return this.raw.words[id]?.[0] ?? id; }

  msg(id, params = {}) {
    const template = this.raw.messages[id] ?? id;
    return template.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? ""));
  }

  phrases(ids) {
    const k = ids.join("|");
    if (!this.byIds.has(k)) {
      const set = new Set(ids);
      const list = this.phraseList.filter((p) => set.has(p.id)).sort((a, b) => b.seq.length - a.seq.length);
      this.byIds.set(k, list);
    }
    return this.byIds.get(k);
  }

  /**
   * Cherche à la position i un mot-clé parmi `ids`. Les mots vides (le, la, the…) et les apostrophes
   * sont ignorés. Renvoie { id, raw, end } où `end` est l'indice qui suit le dernier jeton consommé.
   */
  match(tokens, i, ids) {
    const words = [];
    for (let j = i; j < tokens.length && words.length < 8; j++) {
      const t = tokens[j];
      if (t.type === "apos") continue;
      if (t.type !== "word") break;
      if (this.stop.has(t.norm)) continue;
      words.push({ idx: j, norm: t.norm });
    }
    for (const p of this.phrases(ids)) {
      if (p.seq.length === 0 || p.seq.length > words.length) continue;
      if (p.seq.every((w, k) => words[k].norm === w)) {
        let end = words[p.seq.length - 1].idx + 1;
        for (let k = p.trailing; k > 0 && tokens[end]?.type === "word" && this.stop.has(tokens[end].norm); k--) end++;
        return { id: p.id, raw: p.raw, end };
      }
    }
    return null;
  }

  /** Reconnaît le nom d'une langue (« français », « fr »…). */
  languageMatches(value) { return this.names.includes(norm(value)); }
}
