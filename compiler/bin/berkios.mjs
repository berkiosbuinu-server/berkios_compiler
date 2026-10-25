#!/usr/bin/env node
import { run } from "../src/cli.mjs";

// `apercu` démarre un serveur local (asynchrone) : il est géré à part de la CLI synchrone.
if (["apercu", "aperçu", "preview"].includes(process.argv[2])) {
  const { previewCommand } = await import("../src/preview.mjs");
  process.exitCode = await previewCommand(process.argv.slice(3));
} else {
  process.exitCode = run(process.argv.slice(2));
}
