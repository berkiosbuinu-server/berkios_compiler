import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { compile } from "../src/index.mjs";
import { DataStore, validateWidgetValue, messagesFor, MESSAGES } from "../web/data-store.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const project = compile(readFileSync(path.join(root, "examples/stock.fr.bk"), "utf8")).project;
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };

test("enregistrement valide : valeurs typées et ligne ajoutée", () => {
  const s = new DataStore(project);
  const r = s.insert("Produit", { sku: "A-1", nom: "Câble", quantité: "12", prix: "9,999" });
  assert.equal(r.ok, true);
  assert.deepEqual(s.rows("Produit").map(({ _id, ...v }) => v), [{ sku: "A-1", nom: "Câble", quantité: 12, prix: 10 }]);
});

test("erreurs : obligatoire, minimum, entier, nombre, unicité insensible à la casse et aux accents", () => {
  const s = new DataStore(project);
  assert.deepEqual(s.insert("Produit", { sku: "", nom: "", quantité: "" }).errors.map((e) => e.code).sort(), ["required", "required"]);
  assert.equal(s.insert("Produit", { sku: "X", nom: "N", quantité: "-1" }).errors[0].code, "min");
  assert.equal(s.insert("Produit", { sku: "X", nom: "N", quantité: "1.5" }).errors[0].code, "integer");
  assert.equal(s.insert("Produit", { sku: "X", nom: "N", quantité: "abc" }).errors[0].code, "number");
  s.insert("Produit", { sku: "É-1", nom: "N", quantité: "1" });
  assert.equal(s.insert("Produit", { sku: "e-1", nom: "M", quantité: "2" }).errors[0].code, "unique");
  assert.equal(s.rows("Produit").length, 1);
});

test("le modèle est reconnu d'après les champs de saisie", () => {
  const s = new DataStore(project);
  assert.equal(s.matchModel(["sku", "nom", "quantité"]).name, "Produit");
  assert.equal(s.matchModel(["QUANTITE"]).name, "Produit");
  assert.equal(s.matchModel(["sku", "inconnu"]), null);
  assert.equal(s.matchModel([]), null);
});

test("persistance : rechargement, réinitialisation, stockage corrompu ou indisponible", () => {
  const storage = memory();
  new DataStore(project, { storage }).insert("Produit", { sku: "A", nom: "B", quantité: "1" });
  const again = new DataStore(project, { storage });
  assert.equal(again.rows("Produit").length, 1);
  assert.equal(again.insert("Produit", { sku: "B", nom: "C", quantité: "1" }).row._id, 2);
  again.reset();
  assert.equal(new DataStore(project, { storage }).rows("Produit").length, 0);
  storage.setItem(again.key, "{pas du json");
  assert.equal(new DataStore(project, { storage }).rows("Produit").length, 0);
  const broken = { getItem() { throw new Error("x"); }, setItem() { throw new Error("x"); }, removeItem() { throw new Error("x"); } };
  const s = new DataStore(project, { storage: broken });
  assert.equal(s.insert("Produit", { sku: "A", nom: "B", quantité: "1" }).ok, true);
  assert.doesNotThrow(() => s.reset());
});

test("validation des champs d'après la propriété validation du widget", () => {
  assert.equal(validateWidgetValue({ validation: { required: true } }, "  ").code, "required");
  assert.equal(validateWidgetValue({ validation: { required: true } }, "x"), null);
  assert.equal(validateWidgetValue({ inputKind: "number", validation: { min: 1, max: 5 } }, "9").code, "max");
  assert.equal(validateWidgetValue({ validation: { minLength: 3 } }, "ab").code, "minLength");
  assert.equal(validateWidgetValue({}, ""), null);
});

test("messages : français, anglais, espagnol complets ; repli sur l'anglais", () => {
  const keys = Object.keys(MESSAGES.en).sort();
  for (const l of ["fr", "es"]) assert.deepEqual(Object.keys(MESSAGES[l]).sort(), keys, `clés manquantes en ${l}`);
  assert.equal(messagesFor("sw"), MESSAGES.en);
});
