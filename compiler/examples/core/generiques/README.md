# Fonctions génériques BERKIOS Core

Exemple exécutable de fonctions génériques et d'inférence de type :

```bash
node compiler/bin/berkios.mjs core compiler/examples/core/generiques/fonctions-fr.bks
```

`identite<T>` retourne la valeur avec son type d'origine. `premier<T>` accepte une liste dont les éléments ont le type `T`. Le compilateur infère `T` à partir des arguments, puis vérifie les types et le type de retour.
