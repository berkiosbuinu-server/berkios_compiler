# Exemple : interface avec méthode obligatoire

Depuis la racine du projet :

```bash
node compiler/bin/berkios.mjs core compiler/examples/core/interfaces/rechargeable.bks
```

Sortie attendue : `15`. Une classe `implements Rechargeable` doit fournir `recharger` avec une signature compatible.
