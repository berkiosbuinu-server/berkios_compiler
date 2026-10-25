// FICHIER GÉNÉRÉ par scripts/build-web-examples.mjs : ne pas modifier à la main.
export const EXAMPLES = [
  {
    "id": "stock-fr",
    "kind": "bk",
    "title": {
      "fr": "Gestion de stock (interface, français)",
      "en": "Stock management (interface, French)"
    },
    "source": "langue français\n\napplication \"Gestion de stock\"\n  version 1.0\n  auteur \"BERKIOS\"\n  description \"Suivi simple des produits\"\n  type interface\n  plateformes windows, macos, linux, android\n  édition pro\n\nmodèle Produit\n  sku : texte, unique, obligatoire\n  nom : texte, obligatoire\n  quantité : nombre entier, minimum 0\n  prix : montant\n\ninterface Accueil\n  titre \"Produits en stock\"\n  taille 1280 sur 720\n  fond #f8fafc\n\n  panneau en-tête\n    disposition ligne\n    étiquette titre \"Produits en stock\"\n      taille du texte 26\n      gras\n    bouton ajouter \"Ajouter un produit\"\n      quand on clique : ouvrir Formulaire produit\n\n  tableau liste\n    source : Produit\n    colonnes : sku, nom, quantité, prix\n\ninterface Formulaire produit\n  affichage modale\n  titre \"Nouveau produit\"\n\n  champ sku \"Référence\"\n    obligatoire\n  champ nom \"Nom du produit\"\n    obligatoire\n  champ quantité \"Quantité\"\n    format nombre\n    minimum 0\n  bouton enregistrer \"Enregistrer\"\n    quand on clique : envoyer le formulaire\n  bouton annuler \"Annuler\"\n    quand on clique : fermer\n"
  },
  {
    "id": "stock-en",
    "kind": "bk",
    "title": {
      "fr": "Gestion de stock (interface, anglais)",
      "en": "Stock management (interface, English)"
    },
    "source": "language english\n\napplication \"Gestion de stock\"\n  version 1.0\n  author \"BERKIOS\"\n  description \"Suivi simple des produits\"\n  type interface\n  platforms windows, macos, linux, android\n  edition pro\n\nmodel Produit\n  sku : text, unique, required\n  nom : text, required\n  quantité : whole number, minimum 0\n  prix : amount\n\ninterface Accueil\n  title \"Produits en stock\"\n  size 1280 by 720\n  background #f8fafc\n\n  panel en-tête\n    layout row\n    label titre \"Produits en stock\"\n      text size 26\n      bold\n    button ajouter \"Ajouter un produit\"\n      when clicked : open Formulaire produit\n  table liste\n    source : Produit\n    columns : sku, nom, quantité, prix\n\ninterface Formulaire produit\n  display modal\n  title \"Nouveau produit\"\n\n  field sku \"Référence\"\n    required\n  field nom \"Nom du produit\"\n    required\n  field quantité \"Quantité\"\n    minimum 0\n    format number\n  button enregistrer \"Enregistrer\"\n    when clicked : submit form\n  button annuler \"Annuler\"\n    when clicked : close\n"
  },
  {
    "id": "outils-fr",
    "kind": "bk",
    "title": {
      "fr": "Outils en ligne de commande (français)",
      "en": "Command-line tools (French)"
    },
    "source": "langue français\n\napplication \"Outils\"\n  type commande\n  version 1.0\n  description \"Petits outils en ligne de commande\"\n\ncommande saluer\n  description \"Dit bonjour\"\n  argument nom : texte, obligatoire\n  option répétitions : nombre entier, par défaut 1\n  option fort : booléen\n  action\n    répéter répétitions fois\n      si fort alors\n        afficher \"BONJOUR \" et nom\n      sinon\n        afficher \"Bonjour \" et nom\n\ncommande calculer\n  description \"Applique une opération à deux nombres\"\n  argument premier : nombre décimal, obligatoire\n  argument opération : texte, obligatoire\n  argument second : nombre décimal, obligatoire\n  action\n    si opération est égal à \"+\" alors\n      afficher premier + second\n    sinon\n      si opération est égal à \"*\" alors\n        afficher premier * second\n      sinon\n        si opération est égal à \"/\" alors\n          si second est égal à 0 alors\n            afficher une erreur \"Division par zéro\"\n            arrêter avec le code 1\n          afficher premier / second\n        sinon\n          afficher une erreur \"Opération inconnue : \" et opération\n          arrêter avec le code 2\n\ncommande compter\n  description \"Compte jusqu'à un nombre\"\n  argument limite : nombre entier, obligatoire\n  action\n    définir total comme 0\n    répéter limite fois\n      définir total comme total + 1\n      afficher \"Étape \" et total et \" sur \" et limite\n    afficher \"Terminé : \" et (total * 2) et \" points\"\n"
  },
  {
    "id": "greet-en",
    "kind": "bk",
    "title": {
      "fr": "Salutations en ligne de commande (anglais)",
      "en": "Command-line greeter (English)"
    },
    "source": "language english\n\napplication \"Greeter\"\n  type command\n  version 2.0\n  description \"Greets people\"\n\ncommand greet\n  description \"Greets someone\"\n  argument name : text, required\n  option count : whole number, default 1\n  action\n    repeat count times\n      print \"Hello \" and name\n"
  },
  {
    "id": "core-fr",
    "kind": "bks",
    "title": {
      "fr": "BERKIOS Core : programme complet (français)",
      "en": "BERKIOS Core: full program (French)"
    },
    "source": "module \"Gestion des ventes\"\ntype Article\n  nom: Texte\n  prix: Décimal\nfonction calculer_total(prix: Décimal, quantite: Entier) -> Décimal\n  retourner multiplier(prix, quantite)\nfonction principale() -> Entier\n  soit prix_unitaire: Décimal = 12.5\n  soit quantite: Entier = 3\n  soit total = calculer_total(prix_unitaire, quantite)\n  afficher \"Total de la commande :\"\n  afficher total\n  si total > 30\n    afficher \"Une validation est nécessaire.\"\n  sinon\n    afficher \"Commande standard.\"\n  soit nombres = [10, 20, 30]\n  soit somme_nombres = somme(nombres)\n  afficher somme_nombres\n  soit index = 0\n  tant que index < 2\n    afficher index\n    index = index + 1\n  essayer\n    soit quotient = diviser(total, 0)\n    afficher quotient\n  capturer erreur\n    afficher \"Erreur contrôlée :\"\n    afficher erreur\n  retourner 0\n"
  },
  {
    "id": "core-en",
    "kind": "bks",
    "title": {
      "fr": "BERKIOS Core : programme complet (anglais)",
      "en": "BERKIOS Core: full program (English)"
    },
    "source": "module \"Sales management\"\ntype Item\n  name: Text\n  price: Decimal\nfn calculate_total(price: Decimal, quantity: Int) -> Decimal\n  return multiply(price, quantity)\nfn main() -> Int\n  let unit_price: Decimal = 12.5\n  let quantity: Int = 3\n  let total = calculate_total(unit_price, quantity)\n  print \"Order total:\"\n  print total\n  if total > 30\n    print \"Approval is required.\"\n  else\n    print \"Standard order.\"\n  let numbers = [10, 20, 30]\n  let numbers_sum = sum(numbers)\n  print numbers_sum\n  let index = 0\n  while index < 2\n    print index\n    index = index + 1\n  try\n    let quotient = divide(total, 0)\n    print quotient\n  catch error\n    print \"Handled error:\"\n    print error\n  return 0\n"
  },
  {
    "id": "core-es",
    "kind": "bks",
    "title": {
      "fr": "BERKIOS Core : programme complet (espagnol)",
      "en": "BERKIOS Core: full program (Spanish)"
    },
    "source": "modulo \"Gestión de ventas\"\ntipo Articulo\n  nombre: Texto\n  precio: Decimal\nfuncion calcular_total(precio: Decimal, cantidad: Entero) -> Decimal\n  retornar multiplicar(precio, cantidad)\nfuncion principal() -> Entero\n  sea precio_unitario: Decimal = 12.5\n  sea cantidad: Entero = 3\n  sea total = calcular_total(precio_unitario, cantidad)\n  mostrar \"Total del pedido:\"\n  mostrar total\n  si total > 30\n    mostrar \"Se requiere aprobación.\"\n  sino\n    mostrar \"Pedido estándar.\"\n  sea numeros = [10, 20, 30]\n  sea suma_numeros = suma(numeros)\n  mostrar suma_numeros\n  sea indice = 0\n  mientras indice < 2\n    mostrar indice\n    indice = indice + 1\n  intentar\n    sea cociente = dividir(total, 0)\n    mostrar cociente\n  capturar error\n    mostrar \"Error controlado:\"\n    mostrar error\n  retornar 0\n"
  },
  {
    "id": "core-sw",
    "kind": "bks",
    "title": {
      "fr": "BERKIOS Core : programme complet (swahili)",
      "en": "BERKIOS Core: full program (Swahili)"
    },
    "source": "moduli \"Usimamizi wa mauzo\"\naina Bidhaa\n  jina: Maandishi\n  bei: Desimali\nkazi hesabu_jumla(bei: Desimali, kiasi: Nambari) -> Desimali\n  rudisha kuzidisha(bei, kiasi)\nkazi kuu() -> Nambari\n  acha bei_kila_moja: Desimali = 12.5\n  acha kiasi: Nambari = 3\n  acha jumla = hesabu_jumla(bei_kila_moja, kiasi)\n  onyesha \"Jumla ya agizo:\"\n  onyesha jumla\n  ikiwa jumla > 30\n    onyesha \"Idhini inahitajika.\"\n  vinginevyo\n    onyesha \"Agizo la kawaida.\"\n  acha nambari = [10, 20, 30]\n  acha jumla_nambari = jumlisha(nambari)\n  onyesha jumla_nambari\n  acha faharasa = 0\n  wakati faharasa < 2\n    onyesha faharasa\n    faharasa = faharasa + 1\n  jaribu\n    acha mgawo = gawanya(jumla, 0)\n    onyesha mgawo\n  kamata kosa\n    onyesha \"Hitilafu imeshughulikiwa:\"\n    onyesha kosa\n  rudisha 0\n"
  }
];
