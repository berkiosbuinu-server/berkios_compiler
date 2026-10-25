// Point d'entrée pour les NAVIGATEURS : compilateur et exécution, sans aucune dépendance à Node.js.
// (Le CLI, `exporter` et la configuration utilisent des modules Node : ils ne sont pas inclus ici.)
export { compile, formatDiagnostic } from "./compile.mjs";
export { parse, stripLoc } from "./parser.mjs";
export { translate, printAst } from "./printer.mjs";
export { runCli } from "./runtime.mjs";
export { availableLanguages, getLexicon } from "./lexicon.mjs";
export { parseCore, checkCore, runCore } from "./core-language.mjs";
