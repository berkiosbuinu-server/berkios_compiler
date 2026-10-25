# Modules BERKIOS Core — français

Les modules locaux permettent de séparer les fonctions réutilisables dans plusieurs fichiers `.bks`.

- `main-fr.bks` : programme principal.
- `maths-fr.bks` : fonctions mathématiques importées.

Depuis le dossier du projet, lancez :

```bash
node compiler/bin/berkios.mjs core compiler/examples/core/modules/main-fr.bks
```

Syntaxe localisée : `importer "maths-fr.bks"`. Les alias disponibles sont `import` (anglais), `importar` (espagnol) et `agiza` (swahili). Les imports sont résolus par rapport au fichier qui les déclare. Les cycles d'import sont détectés et refusés.
