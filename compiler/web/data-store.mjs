// Données et validation de l'aperçu navigateur BERKIOS : aucun accès au DOM, testable sous Node.js.
// Les modèles viennent de `project["x-berkios"].models` (produit par le compilateur).

export const norm = (s) => String(s).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Messages de l'aperçu, par langue du fichier .bk. Les langues sans traduction (swahili) retombent sur l'anglais. */
export const MESSAGES = {
  fr: {
    required: "Ce champ est obligatoire.", number: "Saisissez un nombre.", integer: "Saisissez un nombre entier.",
    min: "Doit être au moins {n}.", max: "Doit être au plus {n}.", minLength: "Au moins {n} caractères.", maxLength: "Au plus {n} caractères.",
    unique: "Cette valeur existe déjà.", saved: "Enregistré.", formValid: "Formulaire valide (aucun modèle de données associé).",
    empty: "Aucune donnée.", resetData: "Réinitialiser les données", unsupported: "Action non prise en charge dans l'aperçu navigateur : {type}.",
    excel: "Cette action nécessite Microsoft Excel : elle n'est pas disponible dans le navigateur.", apiError: "Échec de la requête : {error}",
    apiLoading: "Chargement…", close: "Fermer", unknownWidget: "Composant « {type} » : aperçu non disponible",
  },
  en: {
    required: "This field is required.", number: "Enter a number.", integer: "Enter a whole number.",
    min: "Must be at least {n}.", max: "Must be at most {n}.", minLength: "At least {n} characters.", maxLength: "At most {n} characters.",
    unique: "This value already exists.", saved: "Saved.", formValid: "Form is valid (no data model linked).",
    empty: "No data.", resetData: "Reset data", unsupported: "Action not supported in the browser preview: {type}.",
    excel: "This action needs Microsoft Excel: it is not available in the browser.", apiError: "Request failed: {error}",
    apiLoading: "Loading…", close: "Close", unknownWidget: "Component “{type}”: preview not available",
  },
  es: {
    required: "Este campo es obligatorio.", number: "Introduzca un número.", integer: "Introduzca un número entero.",
    min: "Debe ser al menos {n}.", max: "Debe ser como máximo {n}.", minLength: "Al menos {n} caracteres.", maxLength: "Como máximo {n} caracteres.",
    unique: "Este valor ya existe.", saved: "Guardado.", formValid: "Formulario válido (sin modelo de datos asociado).",
    empty: "Sin datos.", resetData: "Restablecer datos", unsupported: "Acción no compatible con la vista previa del navegador: {type}.",
    excel: "Esta acción requiere Microsoft Excel: no está disponible en el navegador.", apiError: "Falló la solicitud: {error}",
    apiLoading: "Cargando…", close: "Cerrar", unknownWidget: "Componente «{type}»: vista previa no disponible",
  },
};
export const messagesFor = (lang) => MESSAGES[lang] ?? MESSAGES.en;
export const format = (text, params = {}) => String(text).replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? ""));

const NUMERIC = new Set(["integer", "decimal", "amount"]);

export class DataStore {
  /**
   * @param {object} project projet compilé (schéma 1.2)
   * @param {{ storage?: {getItem(k:string):string|null, setItem(k:string,v:string):void, removeItem(k:string):void}|null, key?: string }} options
   */
  constructor(project, { storage = null, key = "" } = {}) {
    this.models = project?.["x-berkios"]?.models ?? [];
    this.storage = storage;
    this.key = `berkios:data:${key || project?.name || "app"}`;
    this.data = new Map(this.models.map((m) => [m.name, []]));
    this.nextId = 1;
    this.#load();
  }

  #load() {
    if (!this.storage) return;
    try {
      const saved = JSON.parse(this.storage.getItem(this.key) ?? "null");
      if (!saved || typeof saved !== "object") return;
      for (const m of this.models) if (Array.isArray(saved.rows?.[m.name])) this.data.set(m.name, saved.rows[m.name]);
      if (Number.isInteger(saved.nextId)) this.nextId = saved.nextId;
    } catch { /* stockage indisponible ou corrompu : on repart de zéro */ }
  }

  #save() {
    if (!this.storage) return;
    try { this.storage.setItem(this.key, JSON.stringify({ nextId: this.nextId, rows: Object.fromEntries(this.data) })); } catch { /* quota ou mode privé : l'aperçu continue en mémoire */ }
  }

  model(name) { return this.models.find((m) => norm(m.name) === norm(name)) ?? null; }
  rows(modelName) { return this.model(modelName) ? this.data.get(this.model(modelName).name) : []; }

  /** Modèle dont tous les champs de saisie correspondent à des champs du modèle (le plus complet l'emporte). */
  matchModel(inputNames) {
    const wanted = inputNames.map(norm);
    if (!wanted.length) return null;
    let best = null, bestScore = 0;
    for (const m of this.models) {
      const fields = new Set(m.fields.map((f) => norm(f.name)));
      if (!wanted.every((n) => fields.has(n))) continue;
      if (wanted.length > bestScore) { best = m; bestScore = wanted.length; }
    }
    return best;
  }

  /** Convertit une saisie en valeur typée. Renvoie { value } ou { error }. */
  coerce(field, raw) {
    const text = typeof raw === "string" ? raw.trim() : raw;
    if (typeof raw === "boolean" || field.type === "boolean") return { value: Boolean(raw) };
    if (text === "" || text === null || text === undefined) return { value: null };
    if (NUMERIC.has(field.type)) {
      const n = Number(String(text).replace(",", "."));
      if (!Number.isFinite(n)) return { error: "number" };
      if (field.type === "integer" && !Number.isInteger(n)) return { error: "integer" };
      return { value: field.type === "amount" ? Math.round(n * 100) / 100 : n };
    }
    return { value: String(text) };
  }

  /** Valide un enregistrement. `values` : { nomDuChamp: saisie }. Renvoie la liste des erreurs { field, code, params }. */
  validate(modelName, values, { ignoreId } = {}) {
    const model = this.model(modelName);
    const errors = [], out = {};
    if (!model) return { errors, values: out };
    for (const f of model.fields) {
      const key = Object.keys(values).find((k) => norm(k) === norm(f.name));
      if (key === undefined) continue;
      const { value, error } = this.coerce(f, values[key]);
      if (error) { errors.push({ field: f.name, code: error }); continue; }
      if (value === null) {
        if (f.required) errors.push({ field: f.name, code: "required" });
        out[f.name] = null;
        continue;
      }
      if (NUMERIC.has(f.type)) {
        if (f.min !== undefined && value < f.min) errors.push({ field: f.name, code: "min", params: { n: f.min } });
        if (f.max !== undefined && value > f.max) errors.push({ field: f.name, code: "max", params: { n: f.max } });
      } else if (f.type === "text") {
        if (f.min !== undefined && value.length < f.min) errors.push({ field: f.name, code: "minLength", params: { n: f.min } });
        if (f.max !== undefined && value.length > f.max) errors.push({ field: f.name, code: "maxLength", params: { n: f.max } });
      }
      if (f.unique && this.rows(model.name).some((r) => r._id !== ignoreId && norm(r[f.name] ?? "") === norm(value))) errors.push({ field: f.name, code: "unique" });
      out[f.name] = value;
    }
    return { errors, values: out };
  }

  /** Ajoute un enregistrement s'il est valide. */
  insert(modelName, values) {
    const model = this.model(modelName);
    const { errors, values: clean } = this.validate(modelName, values);
    if (!model || errors.length) return { ok: false, errors };
    const row = { _id: this.nextId++, ...clean };
    this.data.get(model.name).push(row);
    this.#save();
    return { ok: true, row, errors: [] };
  }

  reset() {
    for (const m of this.models) this.data.set(m.name, []);
    this.nextId = 1;
    try { this.storage?.removeItem(this.key); } catch { /* ignoré */ }
  }
}

/** Valide un champ de saisie d'après sa propriété `validation` (schéma 1.2). Renvoie un code d'erreur ou null. */
export function validateWidgetValue(widget, raw) {
  const v = widget.validation;
  const text = typeof raw === "string" ? raw.trim() : raw;
  if (!v) return null;
  if (v.required && (text === "" || text === null || text === undefined || text === false)) return { code: "required" };
  if (text === "" || text === null || text === undefined) return null;
  if (widget.inputKind === "number" || v.min !== undefined || v.max !== undefined) {
    const n = Number(String(text).replace(",", "."));
    if (Number.isNaN(n)) return { code: "number" };
    if (v.min !== undefined && n < v.min) return { code: "min", params: { n: v.min } };
    if (v.max !== undefined && n > v.max) return { code: "max", params: { n: v.max } };
  }
  const len = String(text).length;
  if (v.minLength !== undefined && len < v.minLength) return { code: "minLength", params: { n: v.minLength } };
  if (v.maxLength !== undefined && len > v.maxLength) return { code: "maxLength", params: { n: v.maxLength } };
  return null;
}
