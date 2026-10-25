// Génère web/examples-data.mjs à partir des exemples du dépôt (le terrain de jeu n'a pas accès au disque).
// Usage : node scripts/build-web-examples.mjs          (écrit le fichier)
//         node scripts/build-web-examples.mjs --check  (échoue si le fichier généré n'est pas à jour)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const LIST = [
  { id: "stock-fr", file: "examples/stock.fr.bk", kind: "bk", title: { fr: "Gestion de stock (interface, français)", en: "Stock management (interface, French)" } },
  { id: "stock-en", file: "examples/stock.en.bk", kind: "bk", title: { fr: "Gestion de stock (interface, anglais)", en: "Stock management (interface, English)" } },
  { id: "outils-fr", file: "examples/outils.fr.bk", kind: "bk", title: { fr: "Outils en ligne de commande (français)", en: "Command-line tools (French)" } },
  { id: "greet-en", file: "examples/greet.en.bk", kind: "bk", title: { fr: "Salutations en ligne de commande (anglais)", en: "Command-line greeter (English)" } },
  { id: "core-fr", file: "examples/core/multilingual/complet-fr.bks", kind: "bks", title: { fr: "BERKIOS Core : programme complet (français)", en: "BERKIOS Core: full program (French)" } },
  { id: "core-en", file: "examples/core/multilingual/complete-en.bks", kind: "bks", title: { fr: "BERKIOS Core : programme complet (anglais)", en: "BERKIOS Core: full program (English)" } },
  { id: "core-es", file: "examples/core/multilingual/completo-es.bks", kind: "bks", title: { fr: "BERKIOS Core : programme complet (espagnol)", en: "BERKIOS Core: full program (Spanish)" } },
  { id: "core-sw", file: "examples/core/multilingual/kamili-sw.bks", kind: "bks", title: { fr: "BERKIOS Core : programme complet (swahili)", en: "BERKIOS Core: full program (Swahili)" } },
];

const items = LIST.map(({ file, ...rest }) => ({ ...rest, source: readFileSync(root + file, "utf8").replace(/\r\n/g, "\n") }));
const out = `// FICHIER GÉNÉRÉ par scripts/build-web-examples.mjs : ne pas modifier à la main.\nexport const EXAMPLES = ${JSON.stringify(items, null, 2)};\n`;
const target = root + "web/examples-data.mjs";

if (process.argv.includes("--check")) {
  if (!existsSync(target) || readFileSync(target, "utf8").replace(/\r\n/g, "\n") !== out) { console.error("web/examples-data.mjs n'est pas à jour : lancez « node scripts/build-web-examples.mjs »."); process.exit(1); }
  console.log("web/examples-data.mjs à jour.");
} else {
  writeFileSync(target, out, "utf8");
  console.log(`Écrit : web/examples-data.mjs (${items.length} exemples)`);
}
