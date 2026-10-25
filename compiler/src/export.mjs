import { readFileSync } from "node:fs";

/**
 * Crée un script Node.js autonome à partir d'une application en ligne de commande compilée.
 * Le script embarque le programme et l'interpréteur : il ne dépend ni de BERKIOS ni d'aucun paquet.
 */
export function exportScript(ir) {
  const runtime = readFileSync(new URL("./runtime.mjs", import.meta.url), "utf8").replace(/^export /gm, "");
  return `#!/usr/bin/env node
// ${ir.name} ${ir.version} — généré par BERKIOS CODE. Nécessite Node.js 18 ou plus.
// Utilisation : node <ce fichier> ${ir.sourceLanguage === "fr" ? "--aide" : "--help"}

const IR = ${JSON.stringify(ir, null, 2)};

${runtime}
process.exitCode = runCli(IR, process.argv.slice(2));
`;
}
