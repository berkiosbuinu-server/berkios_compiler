# BERKIOS — programming-language and application-development ecosystem

**BERKIOS CODE** is a multilingual declarative language (`.bk`) for describing application projects, data models, interfaces and command-line tools. Its compiler produces BERKIOS GRAPHIC project JSON and includes a browser preview/playground. **BERKIOS Core** (`.bks`) is a separate typed language; support and syntax must be checked against the current compiler version.

- **Official website:** https://graphic.berkios.online/
- **BERKIOS CODE overview:** https://graphic.berkios.online/language.html
- **Documentation portal:** https://graphic.berkios.online/docs/
- **Online development environment:** https://dev.berkios.online/
- **Compiler source:** https://github.com/berkiosbuinu-server/berkios_compiler
- **npm package:** https://www.npmjs.com/package/berkios-code

## Quick start

Requirements: Node.js `>=22.18`.

Install the published package:

```sh
npm install -g berkios-code
```

Create, validate and compile a French-language project:

```sh
berkios --lg --fr
berkios nouveau main.bk
berkios valider main.bk
berkios compiler main.bk
berkios apercu main.bk
```

A `.bk` file must declare one programming language, for example `langue français` or `language english`. Do not mix keyword languages in one file. Commands, aliases and feature coverage can change by version; consult the README inside `compiler/` and the current examples.

## BERKIOS CODE example

```text
langue français

application "Gestion de stock"
  version 1.0
  auteur "BERKIOS"
  description "Suivi simple des produits"
  type interface
  plateformes windows, macos, linux, android

modèle Produit
  sku : texte, unique, obligatoire
  nom : texte, obligatoire
  quantité : nombre entier, minimum 0
  prix : montant
```

For a complete application, see [`compiler/examples/stock.fr.bk`](compiler/examples/stock.fr.bk). This excerpt illustrates the declaration style; validate it with the compiler version you use before relying on it.

## BERKIOS Core

BERKIOS Core uses `.bks` files and has syntax distinct from `.bk`. It includes typed examples such as [`compiler/examples/core/multilingual/complet-fr.bks`](compiler/examples/core/multilingual/complet-fr.bks) and [`compiler/examples/core/industrial.bks`.](compiler/examples/core/industrial.bks) Do not assume every `.bk` feature exists in `.bks`, or that all Core syntax is multilingual.

## Documentation for developers and AI assistants

- [BERKIOS CODE reference](https://graphic.berkios.online/docs/berkios-code.md)
- [BERKIOS Core reference](https://graphic.berkios.online/docs/berkios-core.md)
- [Validated examples directory](https://github.com/berkiosbuinu-server/berkios_compiler/tree/main/compiler/examples)
- [AI-oriented index](https://graphic.berkios.online/llms.txt)

AI assistants should consult the version-specific reference and real examples before generating code. Generated code should be checked using `berkios valider` or the equivalent command for the installed version. Never claim a program was compiled successfully unless the compiler was actually run.

## Current capabilities and limitations

BERKIOS CODE currently documents a declarative application description, data models, interfaces, command-line tools, translation between supported keyword languages, and browser preview. The exact supported components and actions are version-specific. BERKIOS Core is a distinct typed language with an evolving feature set. Consult the compiler README and tests for current behavior.

## Contributing useful bug reports

Include:
- compiler version and operating system;
- the smallest source file that reproduces the issue;
- exact command used;
- full diagnostic output;
- expected and actual behavior.

## License

The compiler package declares the MIT license. Check the repository root and each component's license before assuming that all ecosystem assets use the same terms.
