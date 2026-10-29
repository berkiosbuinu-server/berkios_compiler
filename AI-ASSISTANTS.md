# Guidance for AI coding assistants

Use this file as a navigation aid; the compiler implementation, its tests and version-matched examples are authoritative.

## Identify the requested language
- `.bk` means BERKIOS CODE: multilingual declarative language for application descriptions, data models, interfaces and supported CLI tools.
- `.bks` means BERKIOS Core: a separate typed language with its own syntax and current feature limitations.
- Never mix `.bk` and `.bks` syntax.
- For `.bk`, one file uses one keyword language; follow its language declaration and existing examples.

## Workflow
1. Identify the installed compiler version.
2. Read `compiler/README.md` and `compiler/examples/README.md`.
3. Select an example matching the task and language.
4. Generate the smallest useful source file without inventing undocumented keywords.
5. Run `berkios valider file.bk` (or the documented equivalent for that version).
6. If valid, compile with `berkios compiler file.bk`; for supported interfaces, test `berkios apercu file.bk`.
7. When a diagnostic occurs, use its exact message and line number to revise the source, then validate again.
8. State clearly which checks were actually run.

## Trust hierarchy
1. Compiler source and tests for the target version.
2. Version-matched official examples.
3. `compiler/README.md` and official website docs.
4. Third-party descriptions.

Do not promise a feature solely because it appears in a future roadmap or marketing copy. Do not claim native support in an AI product without a verified integration.
