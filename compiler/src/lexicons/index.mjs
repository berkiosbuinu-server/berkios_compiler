// Registre des langues de BERKIOS CODE.
// Les fichiers JSON sont importés statiquement : le même code fonctionne dans Node.js et dans un navigateur (sans lecture de disque).
// Pour ajouter une langue : créer <code>.json, puis l'ajouter ici (un test vérifie que ce registre et le dossier correspondent).
import fr from "./fr.json" with { type: "json" };
import en from "./en.json" with { type: "json" };
import es from "./es.json" with { type: "json" };
import sw from "./sw.json" with { type: "json" };

export const LEXICON_DATA = { fr, en, es, sw };
