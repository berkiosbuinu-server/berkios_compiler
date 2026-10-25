# Exemple : méthodes d’instance

Depuis le dossier racine du projet :

```bash
node compiler/bin/berkios.mjs core compiler/examples/core/classes/compte.bks
```

Sortie attendue : `150`, `130`, puis `130`. Les méthodes utilisent `self.champ` pour lire ou modifier l’état de l’instance.
