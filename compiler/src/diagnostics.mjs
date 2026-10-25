/** Erreur structurée : un code stable, des paramètres, une position. Le texte est produit par le lexique de la langue du fichier. */
export class Diag extends Error {
  constructor(code, params = {}, line = 0, col = 0, severity = "error") {
    super(code);
    this.code = code;
    this.params = params;
    this.line = line;
    this.col = col;
    this.severity = severity;
  }
}

export function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

/** Meilleure suggestion proche (distance ≤ 2, ou ≤ un tiers de la longueur), sinon null. */
export function closest(word, candidates) {
  let best = null, bestD = Infinity;
  for (const c of candidates) {
    const d = levenshtein(word, c.key ?? c);
    if (d < bestD) { bestD = d; best = c; }
  }
  const limit = Math.max(2, Math.floor(word.length / 3));
  return best !== null && bestD <= limit ? (best.label ?? best) : null;
}
