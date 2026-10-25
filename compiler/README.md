> **Langues supplémentaires (préversion) :** les lexiques espagnol (`es`) et swahili (`sw`) sont ajoutés. Les mots-clés de base sont disponibles, mais la traduction des diagnostics et la couverture complète de chaque alias restent à finaliser. BERKIOS Core (syntaxe typée `fonction` / `fn`) n'est pas encore multilingue : cette extension concerne le compilateur déclaratif `.bk`.

# BERKIOS CODE — compilateur et aperçu navigateur

Compile des fichiers `.bk` (langage déclaratif multilingue, en langage naturel) vers le projet JSON de BERKIOS GRAPHIC (schéma 1.2), que le Studio et le Bridge savent déjà ouvrir.

**Règle d'or : un fichier = une seule langue.** Français et anglais au départ ; un fichier qui mélange les langues est refusé avec un message explicite.

## Installation et utilisation

Prérequis : Node.js 22.18 ou plus. Aucune dépendance à installer.

```
npm install -g berkios-code   # depuis npm : la commande « berkios » devient disponible
```

Depuis le dépôt (développement) : `cd compiler`, puis `npm link` (ou : `node bin/berkios.mjs …`).

```
berkios --lg --fr             # choisit le français comme langue de programmation
berkios -m --lg --en          # change de langue (anglais)
berkios --lg                  # affiche la langue actuelle

berkios nouveau main.bk       # crée un fichier de départ dans votre langue
berkios valider main.bk       # vérifie sans rien écrire
berkios compiler main.bk      # produit main.berkios.json (ouvrable dans le Studio)
berkios apercu main.bk        # affiche l'application dans le navigateur (rechargement automatique)
berkios traduire main.bk --vers en -o main.en.bk

# applications en ligne de commande (type commande)
berkios nouveau outil.bk --type commande
berkios lancer outil.bk Alice --répétitions 2      # exécute directement
berkios exporter outil.bk -o outil.mjs             # script Node.js autonome : node outil.mjs Alice
```

## Aperçu dans le navigateur

Pas besoin du Studio ni de Flutter pour **voir et faire fonctionner** une application à interface :

```
berkios apercu stock.bk            # ouvre http://127.0.0.1:<port>/ ; Ctrl+C pour arrêter
berkios apercu stock.bk --port 4173 --sans-ouvrir
```

Le fichier est compilé puis affiché ; chaque enregistrement du `.bk` recharge la page, et les erreurs de syntaxe s'affichent à l'écran avec leur ligne. Le serveur n'écoute que sur `127.0.0.1`.

Ce que l'aperçu **sait faire** : les six composants de BERKIOS CODE (étiquette, bouton, champ, case à cocher, tableau, panneau), les interfaces page / fenêtre modale / panneau latéral, la mise à l'échelle sur petit écran, et les actions *ouvrir/fermer une interface*, *message*, *montrer/cacher/basculer*, *envoyer/vider le formulaire* et *appel d'API* (soumise aux règles CORS du navigateur).

Règle des formulaires : à l'envoi, si les champs de saisie portent des noms de champs d'un `modèle`, la ligne est validée (obligatoire, minimum/maximum, entier, unicité) puis ajoutée au tableau lié. Les données restent **dans le navigateur** (`localStorage`) ; le bouton « Réinitialiser les données » les efface. C'est une aide à la conception : ce n'est pas la persistance SQLite des applications générées.

**Limites :** les actions Excel ne sont pas disponibles dans un navigateur ; les composants du Studio autres que ces six s'affichent comme des cases en pointillés ; le rendu n'est pas garanti identique à celui de Flutter.

### Terrain de jeu en ligne

Le dossier `web/` contient aussi un terrain de jeu (`web/index.html`) : on écrit du code, on voit les erreurs, l'application fonctionne à côté, et l'on peut **traduire** le programme, **copier un lien de partage** et télécharger le `.berkios.json` pour le Studio. Les applications en ligne de commande et BERKIOS Core (`.bks`) s'y exécutent aussi. Il fonctionne sur n'importe quel hébergement statique (par exemple GitHub Pages) ; il faut un navigateur récent (import de JSON).

### Dans votre propre page web

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/berkios-code/web/berkios-web.css">
<div id="app" style="height:100vh"></div>
<script type="module">
  import { compile } from "https://cdn.jsdelivr.net/npm/berkios-code/src/browser.mjs";
  import { mountApp } from "https://cdn.jsdelivr.net/npm/berkios-code/web/berkios-web.mjs";
  const { ok, project, diagnostics } = compile(sourceBk);   // le .bk doit commencer par « langue français », « language english »…
  if (ok) mountApp(document.getElementById("app"), project);
</script>
```

Avec un bundleur : `import { compile } from "berkios-code/browser"` et `import { mountApp } from "berkios-code/web"`. Pensez à fixer une version dans l'URL (`berkios-code@0.8.0`).

Sous Windows sans `npm link` : `compiler\berkios.cmd valider main.bk`.

`--lg` configure la langue la première fois ; pour la changer il faut `-m` (sinon la commande refuse, pour éviter un changement accidentel). Les commandes existent dans les deux langues (`valider`/`validate`, `compiler`/`compile`, `traduire`/`translate`, `nouveau`/`new`).

## Le langage en bref

```
langue français

application "Gestion de stock"
  type interface
  plateformes windows, android

modèle Produit
  sku : texte, unique, obligatoire
  quantité : nombre entier, minimum 0

interface Accueil
  panneau en-tête
    disposition ligne
    étiquette titre "Produits en stock"
      taille du texte 26
      gras
    bouton ajouter "Ajouter"
      quand on clique : ouvrir Formulaire produit
  tableau liste
    source : Produit
    colonnes : sku, quantité
```

- Une ligne = une instruction ; l'indentation (2 espaces) exprime l'appartenance. Pas d'accolades, pas de point-virgule.
- Articles et petits mots (le, la, un, des, the, a, of…) sont facultatifs et ignorés.
- Accents et majuscules sont facultatifs dans les mots-clés (`MODELE` = `modèle`).
- Commentaires : `//`. Guillemets : `"…"` ou `« … »`.
- **Mise en page automatique** : sans `position`, les composants s'empilent verticalement ; `disposition ligne` les aligne horizontalement dans un panneau.
- Les mots-clés sont dans `src/lexicons/<langue>.json`. Ajouter une langue = ajouter un fichier de lexique complet (un test vérifie qu'aucun mot-clé ne manque et qu'aucun n'est ambigu).

### Applications en ligne de commande

```
langue français

application "Outils"
  type commande

commande saluer
  description "Dit bonjour"
  argument nom : texte, obligatoire
  option répétitions : nombre entier, par défaut 1
  option fort : booléen
  action
    répéter répétitions fois
      si fort alors
        afficher "BONJOUR " et nom
      sinon
        afficher "Bonjour " et nom
```

```
berkios lancer outil.bk saluer Alice --répétitions 2 --fort
berkios lancer outil.bk saluer --aide              # aide générée automatiquement
```

- **Instructions** : `afficher`, `afficher une erreur` (écrit sur la sortie d'erreur, n'arrête pas), `arrêter avec le code N`, `définir x comme …`, `si … alors` / `sinon`, `répéter N fois`.
- **Valeurs** : textes, nombres, `vrai`/`faux`, arguments, options et variables. `et` assemble des morceaux de texte ; `+ - * /` et les parenthèses calculent (entourez les opérateurs d'espaces). Comparaisons : `est égal à`, `n’est pas égal à`, `est inférieur à`, `est supérieur à`, `est inférieur ou égal à`, `est supérieur ou égal à`.
- **Ligne de commande de l'application** : arguments dans l'ordre, options `--nom valeur` ou `--nom=valeur`, booléens `--fort`, `--` termine les options, `--aide`/`--help`, `--version`. Le nom d'une option s'écrit sans accents (`--repetitions`) ; la version accentuée est aussi acceptée.
- **Codes de sortie** : 0 succès, 1 erreur d'exécution (division par zéro, texte non numérique…), 2 mauvaise utilisation (argument manquant, valeur invalide…), ou le code demandé par `arrêter`.
- **Garde-fous** : variables propres à leur bloc (vérifiées à la compilation, avec suggestion « Vouliez-vous dire… ? »), arguments non modifiables, limite de 5 millions d'étapes contre les boucles démesurées.
- Un nom de variable ne doit pas contenir le mot `et` (ou `and`) ni un mot-clé de comparaison : `traduire` vérifie que le texte traduit redonne exactement le même programme et **refuse** la traduction sinon (par exemple un argument nommé `a`, qui est un mot vide en anglais).

Voir `examples/` : `stock.fr.bk` et `stock.en.bk` sont **le même programme** et donnent exactement le même JSON.

## Ce qui est pris en charge en v0.1

| Domaine | Pris en charge |
|---|---|
| Application | `version`, `auteur`, `description`, `type` (`interface`, `excel`), `plateformes`, `édition` |
| Modèles de données | types texte, nombre entier, nombre décimal, montant, date, booléen ; `unique`, `obligatoire`, `minimum`, `maximum` |
| Interfaces | page, modale, tiroir ; `taille`, `fond`, `thème`, `titre` |
| Composants | bouton, étiquette, champ, case à cocher, tableau, panneau (avec composants imbriqués) |
| Propriétés | `position`, `taille`, `couleur`, `fond`, `taille du texte`, `gras`, `alignement`, `format`, validations, `source`/`colonnes` |
| Actions de bouton | ouvrir/fermer une interface, afficher un message, montrer/cacher/basculer un composant, envoyer/vider le formulaire, appeler une API, lire/écrire Excel |
| Applications en ligne de commande | `commande` avec `argument`, `option`, `action` ; variables, conditions, boucles, calculs ; `lancer` (exécution directe) et `exporter` (script Node.js autonome) |
| Excel | `cellule` et `feuille` liées aux composants (même mécanisme que le complément Office actuel) |
| Contrôles | références inconnues avec suggestion « Vouliez-vous dire… ? », doublons, limites d'édition, erreurs avec ligne et colonne, messages dans la langue du fichier |

## Ce qui n'est PAS encore là (et l'outil le dit)

- `règle` (règles métier) : reconnu, mais refusé avec « pas encore pris en charge ».
- **Applications en ligne de commande** : pas d'exécutable natif (`.exe`) ni de code Dart — l'application s'exécute avec l'interpréteur de BERKIOS ou comme script Node.js 18+ exporté. Pas encore de lecture/écriture de fichiers, de saisie au clavier, d'appels réseau, de listes, de fonctions ni de boucle « tant que ». Une option sans valeur par défaut vaut la valeur neutre de son type (texte vide, 0, faux).
- Excel « mode pilote » (macros VBA, import d'un `.xlsm`), `classeur`, `plage` : prévus dans la spécification, pas implémentés. Le type `excel` de la v0.1 compile vers le mode Excel actuel du Studio (liaison de cellules).
- Un seul événement (`quand on clique`) et une seule action par bouton, car le schéma 1.2 n'en connaît pas davantage.
- Pas de bloc `code natif`, pas de fonctions, pas de tests intégrés.
- `traduire` réécrit le fichier sous sa forme canonique : **les commentaires ne sont pas conservés**.
- Les noms que vous choisissez et les textes affichés ne sont pas traduits (seuls les mots-clés le sont).
- Pas d'extension VS Code ni de serveur de langage.

## Écarts avec la spécification v0.1 (document)

Quelques choix d'implémentation à valider :

- Les contraintes d'un champ de modèle sont séparées par des virgules : `sku : texte, unique, obligatoire`.
- Le titre d'une interface (`titre`) et les colonnes/source d'un tableau sont conservés dans le champ `x-berkios` du JSON ; le schéma 1.2 du Studio n'a pas d'emplacement pour eux, donc **le Studio les ignore pour l'instant** (le `.bk` reste la source de vérité).
- Le numéro de version de l'application est écrit dans `appVersion`. Jusqu'en v0.5.31 le Studio le remplaçait par « 1.0.0 » à l'ouverture (expression régulière erronée) ; corrigé en v0.5.32.

## Architecture

```
main.bk → tokenizer → parser (lexique de la langue) → AST indépendant de la langue
        → analyse sémantique → mise en page → projet JSON 1.2
AST → printer (lexique cible) → main.<autre langue>.bk        (berkios traduire)
type commande : AST → analyse → représentation « cli » (JSON) → runtime.mjs   (berkios lancer / exporter)
```

Tests : `npm test` (49 tests, dont : même JSON en fr et en, aller-retour de traduction, rejet des langues mélangées, acceptation de la sortie par `parseProject` du Studio et par le Bridge qui génère un projet Flutter, exécution des applications en ligne de commande et du script exporté).


## BERKIOS Core — langage généraliste typé (expérimental)

Le DSL `.bk` continue à décrire les interfaces et les applications BERKIOS GRAPHIC. Pour les algorithmes, la logique métier et les traitements, un noyau distinct `.bks` est introduit. Il apporte fonctions typées, types de données déclarés, listes/dictionnaires, boucles, conditions et récupération d’erreurs.

```powershell
node bin/berkios.mjs core examples/core/industrial.bks
```

Exemple :

```text
module "Industrial telemetry"

fn average(values: List<Float>) -> Float
  let total: Float = sum(values)
  return total / len(values)

fn main() -> Int
  let samples: List<Float> = [21.4, 22.1, 21.9]
  print "Average: " + average(samples)
  try
    raise "Sensor fault"
  catch problem
    print problem
  return 0
```

Types disponibles dans cette étape : `Int`, `Float`, `Decimal`, `Bool`, `Text`, `List<T>` et `Map<K, V>`. Fonctions intégrées : `len`, `longueur`, `sum`, `abs`, `min`, `max`. Les mots-clés courants ont des alias français et anglais. Les déclarations `type` décrivent les champs, mais la construction d’instances, les interfaces avancées, les génériques complets, les tests de propriétés, l’analyse de concurrence et la compilation native ne sont pas encore implémentés. Ne pas utiliser ce prototype seul dans un système critique.

## BERKIOS Core — modules locaux (.bks)

Les programmes Core peuvent importer un autre fichier `.bks` avec un mot-clé de la langue du projet : `import` (en), `importer` (fr), `importar` (es), `agiza` (sw). Le chemin est relatif au fichier qui réalise l'import. Les fonctions et types importés sont fusionnés à l'unité de compilation, vérifiés et exécutables depuis le programme principal. Les imports introuvables et les cycles sont signalés.

Exemple exécutable : `node compiler/bin/berkios.mjs core compiler/examples/core/modules/main-fr.bks`.


### v0.7.56 — Constructeurs de valeurs

Les types déclarés peuvent être instanciés avec des constructeurs positionnels et leurs champs consultés par notation pointée. Les types génériques simples sont inférés depuis les arguments.

### Classes et interfaces (v0.7.56)

BERKIOS Core prend en charge les déclarations `class` et `interface`, avec vérification structurelle des champs requis par les interfaces. Voir `../RELEASE_NOTES_v0.7.56-classes-interfaces.md` pour l'exemple et les limites actuelles.


### v0.7.57 — Méthodes d’instance

Les classes BERKIOS Core peuvent définir des méthodes avec `fn`, utiliser `self.champ` ou `this.champ`, modifier les champs et appeler les méthodes via `instance.methode(...)`. Exemple : `examples/core/classes/compte.bks`.
### v0.7.58 — Méthodes d’interface

Les interfaces peuvent définir des signatures `fn` sans corps. Les classes qui les implémentent doivent fournir des méthodes avec des signatures compatibles. Exemple : `examples/core/interfaces/rechargeable.bks`.


### Fonctions génériques (v0.7.59)

Exemple exécutable : `examples/core/generiques/fonctions-fr.bks`. Les fonctions peuvent déclarer des paramètres de type, par exemple `fn identite<T>(valeur: T) -> T`. Le compilateur infère les types à partir des arguments et vérifie la cohérence des utilisations.


### v0.7.60 — Héritage et polymorphisme

Les classes peuvent hériter d'une classe parent avec `extends`. Les champs hérités sont inclus dans le constructeur positionnel, les méthodes sont héritées, et les méthodes redéfinies sont sélectionnées depuis le type concret de l'objet. Les signatures des redéfinitions sont vérifiées. Exemple : `examples/core/heritage/animaux-fr.bks`.
