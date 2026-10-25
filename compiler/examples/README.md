# Exemples BERKIOS CODE (.bk)

| Fichier | Langue | Ce qu'il montre |
|---|---|---|
| `stock.fr.bk` | français | modèle de données, deux interfaces (page + modale), tableau lié au modèle, actions |
| `stock.en.bk` | english | **le même programme** que `stock.fr.bk` (généré par `berkios traduire`) : les deux donnent exactement le même projet JSON |
| `ventes-excel.fr.bk` | français | application de type `excel` : composants liés à des cellules, lecture/écriture Excel |
| `sales-excel.en.bk` | english | idem, écrit nativement en anglais |

| `outils.fr.bk` | français | application **en ligne de commande** : trois commandes (arguments, options, conditions, boucles, calculs) |
| `tools.en.bk` | english | le même programme, généré par `berkios traduire` |
| `greet.en.bk` | english | petite application en ligne de commande écrite nativement en anglais |

```
berkios valider stock.fr.bk
berkios compiler stock.fr.bk -o stock.berkios.json
berkios traduire stock.fr.bk --vers en
berkios lancer outils.fr.bk calculer 6 "*" 7
berkios exporter outils.fr.bk -o outils.mjs
```

Un fichier = une seule langue. Les noms que vous choisissez (Produit, quantité…) et les textes affichés ne sont pas traduits : seuls les mots-clés le sont.

## BERKIOS Core — langage de programmation multilingue

Le dossier `core/multilingual/` contient quatre programmes de démonstration équivalents :

- `complet-fr.bks` : français — `fonction`, `soit`, `retourner`, `afficher`, `si`, `sinon`, `tant que`.
- `complete-en.bks` : anglais — `fn`, `let`, `return`, `print`, `if`, `else`, `while`.
- `completo-es.bks` : espagnol — `funcion`, `sea`, `retornar`, `mostrar`, `si`, `sino`, `mientras`.
- `kamili-sw.bks` : swahili — `kazi`, `acha`, `rudisha`, `onyesha`, `ikiwa`, `vinginevyo`, `wakati`.

Chaque exemple montre des types, variables, fonctions réutilisables, opérations mathématiques, conditions, listes, boucle, et gestion d'une division par zéro. Les alias mathématiques comprennent par exemple `multiplier`, `multiply`, `multiplicar`, `kuzidisha` et les formes localisées de division.

La langue doit correspondre à `codeLanguage` du projet lors de la vérification. Ces exemples décrivent les fonctionnalités effectivement prises en charge par la version actuelle de BERKIOS Core, pas toutes les fonctionnalités futures prévues.
