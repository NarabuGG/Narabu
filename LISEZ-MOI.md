# Narabu : mettre le site en ligne, gratuitement

Ce dossier est le site complet. Une fois en ligne tu auras :

- une vraie adresse, du type `https://TONPSEUDO.github.io/narabu/` : la page de présentation (`index.html`), et la carte juste derrière (`carte.html`) ;
- la carte avec toutes les rues partout (OpenFreeMap) ;
- les infos des gens partagées **en temps réel** entre tous les visiteurs (Firebase) ;
- le bouton « Autour de moi » et la question automatique « Tu es au McDo X ? » ;
- la météo en direct dans l'estimation (Open-Meteo) ;
- une appli installable sur l'écran d'accueil du téléphone, avec son icône ;
- un bouton « Partager », des points, un classement du mois, un bouton « Signaler un problème » ;
- une page de mentions légales et de confidentialité à compléter ;
- des mises à jour automatiques faites par GitHub, sans rien toucher.

Rien n'est payant et aucune carte bancaire n'est demandée. Compte 20 à 30 minutes.

---

## Étape 1 : GitHub (héberge le site et lance les mises à jour)

1. Crée un compte sur https://github.com (gratuit).
2. Clique sur **New repository**. Nom : `narabu`. Laisse **Public**. Clique sur **Create repository**.
3. Sur la page du dépôt, clique sur **uploading an existing file**.
4. Ouvre ce dossier sur ton PC, sélectionne **tout son contenu** (y compris le dossier `.github`) et glisse-le dans la page. Clique sur **Commit changes**.
5. Va dans **Settings > Pages**. Dans « Source », choisis **GitHub Actions**.
6. Va dans l'onglet **Actions**. Si un bouton vert demande d'activer les workflows, clique dessus. Ouvre « Mise à jour automatique » puis **Run workflow**.
7. Au bout d'une à deux minutes, l'adresse du site s'affiche dans **Settings > Pages**.

À ce stade le site marche déjà (carte, estimation, météo, position). Les infos des gens restent sur l'appareil de chacun tant que l'étape 2 n'est pas faite.

> Si le dossier `.github` n'apparaît pas dans ton explorateur de fichiers, active l'affichage des fichiers cachés. Sans lui, pas de mises à jour automatiques.

## Étape 2 : Firebase (partage des infos en temps réel)

1. Va sur https://console.firebase.google.com et crée un projet (nom libre, tu peux refuser Google Analytics).
2. Menu **Créer > Firestore Database > Créer une base de données**. Emplacement : `eur3 (Europe)`. Mode : **production**.
3. Onglet **Règles** : efface tout, colle le contenu du fichier `firestore.rules` de ce dossier, puis **Publier**.
4. Menu **Créer > Authentication > Commencer**. Onglet **Mode de connexion** : active **Anonyme**.
5. Toujours dans Authentication, onglet **Paramètres > Domaines autorisés** : ajoute `TONPSEUDO.github.io`.
6. Roue dentée **Paramètres du projet > Vos applications**, clique sur l'icône web `</>`, donne un nom, **Enregistrer**. Firebase affiche un bloc `firebaseConfig = { ... }`.
7. Sur GitHub, ouvre le fichier `config.js`, clique sur le crayon, et remplace `firebase: null,` par `firebase: { ... },` avec ton bloc. Clique sur **Commit changes**.

Deux minutes plus tard le site est à jour. Cette clé peut être publique : c'est prévu par Firebase, et ce sont les règles du point 3 qui protègent la base.

## Étape 3 : compléter les mentions légales

Ouvre `mentions.html` sur GitHub (crayon) et remplace tout ce qui est surligné entre [crochets] : la date, ton contact, et qui édite le site.

Deux choix pour « qui édite » :
- tu mets ton nom et ton adresse ;
- ou, si le site n'est pas professionnel, tu restes anonyme et tu n'affiches que l'hébergeur. La loi le permet à condition que l'hébergeur connaisse ton identité : ton compte GitHub doit donc contenir tes vraies informations. Dès que le site rapporte de l'argent, ce choix n'est plus possible.

C'est un modèle fidèle à ce que le site fait aujourd'hui, pas un avis juridique. Fais-le relire avant d'ouvrir le site au grand public.

## Étape 4 : vérifier

- Ouvre le site sur ton téléphone et sur ton PC.
- En bas du panneau, tu dois lire « En ligne : les infos sont partagées en direct ».
- Signale un resto sur le téléphone : la pastille change sur le PC en une ou deux secondes, sans recharger.
- Sur le téléphone, appuie sur le bouton en forme de cible (« Autour de moi ») et accepte la position.
- Pour installer l'appli : sur Android, Chrome propose « Installer l'appli » (bouton en bas du panneau). Sur iPhone, dans Safari : Partager > Sur l'écran d'accueil.

---

## Ce qui tourne tout seul

| Quoi | Quand | Fichier |
|---|---|---|
| Infos des gens visibles par tous | en direct, 1 à 2 secondes | Firebase |
| Météo du moment par département | toutes les 30 minutes, dans le navigateur | Open-Meteo |
| Apprentissage : l'estimation de chaque resto se corrige selon ce que les gens ont signalé | toutes les heures | `scripts/apprendre.mjs` |
| Classement du mois (pseudos tirés au hasard) | toutes les heures | `scripts/apprendre.mjs` |
| Ménage : suppression des infos de plus de 60 jours | chaque nuit | `scripts/apprendre.mjs` |
| Calendrier officiel : vacances scolaires par zone, jours fériés | chaque nuit | `scripts/calendrier.py` |
| Liste des restos : ouvertures, fermetures, horaires | chaque lundi | `scripts/restos.py` |
| Remise en ligne du site | à chaque modification et toutes les heures | `.github/workflows/maj.yml` |

## Ce qui rend l'info plus rapide et plus précise

- **Chrono d'attente.** On le lance en arrivant dans la file, on appuie sur « J'ai ma commande » quand on est servi. C'est la seule vraie mesure : elle remplace l'avis par un nombre de minutes et compte 1,5 fois plus. Le chrono survit si on ferme la page.
- **File d'attente.** « Combien de personnes devant toi ? » : facile à compter exactement, et ça ajuste le niveau.
- **Question automatique.** Si quelqu'un a activé « Autour de moi » et se trouve dans un resto, l'appli lui demande « Ça attend combien ? » : un clic et c'est envoyé.
- **Info confirmée sur place.** Une info donnée à moins de 200 m du resto compte plus (×1,3). Une info donnée à plus de 500 m compte moins (×0,5).
- **« Toujours vrai ? »** Quand quelqu'un a déjà donné une info, le suivant la confirme en un clic.
- **Infos incohérentes.** À partir de 3 infos sur un resto, celle qui contredit nettement les autres ne compte presque plus (erreur ou blague).
- **Fiabilité affichée.** Chaque fiche dit « faible », « moyenne » ou « élevée » selon le nombre d'infos, leur fraîcheur, celles données sur place et les attentes chronométrées.
- **Détails.** Bornes prises, service lent, nombre de personnes : ils ajustent le niveau.
- **Fraîcheur.** Une info perd la moitié de son poids toutes les 20 minutes et disparaît au bout de 1 h 30.

## Compter les personnes sur une photo (désactivé par défaut)

Le site sait compter les personnes sur une photo avec une IA gratuite qui tourne **dans le téléphone** : la photo n'est ni envoyée ni enregistrée, seul le nombre part. C'est ce qui se rapproche le plus d'un vrai comptage sans rien installer dans le resto.

Pourquoi c'est désactivé : photographier des clients dans un restaurant et analyser l'image automatiquement est une zone grise en France (droit à l'image, RGPD, et la CNIL encadre le comptage de personnes par analyse d'images). Je ne suis pas juriste. Fais valider ce point avant de l'activer pour le public, puis mets `photo: true` dans `config.js`.

Limites techniques : l'IA ne voit que ce qui est sur la photo et rate les personnes cachées ou trop petites. Le nombre est donc un minimum. Le premier comptage télécharge le modèle (quelques dizaines de Mo).

## Points, partage, problèmes

- **Points.** Une info rapporte 10 points. Bonus : +5 si elle est donnée sur place, +15 pour une attente chronométrée, +5 pour un comptage photo, +2 pour la file, +2 pour un détail (réglable dans `modele.js`, fonction `ptsOf`). Une info donnée de loin ne rapporte que 2 points, et une seule info compte par resto toutes les 30 minutes : ça limite la triche.
- **Classement.** Personne ne choisit de pseudo : il est tiré au hasard à partir de l'identifiant anonyme (« Frite malin 42 »). Rien à modérer, aucun identifiant publié.
- **Partager.** Chaque resto a son lien direct (`.../#r-m1582`). Sur téléphone, le bouton ouvre le menu de partage (WhatsApp, Snap, etc.).
- **Signaler un problème.** Les signalements arrivent dans Firebase, collection `problemes` (visible seulement par toi, dans la console). Le chiffre `k` veut dire : 1 fermé définitivement, 2 mal placé, 3 horaires faux, 4 info fausse, 5 autre.

## Les enseignes

10 enseignes : McDonald's, Burger King, KFC, Quick, O'Tacos, Five Guys, Popeyes, Chicken Street, Chamas Tacos et Bioburger (3 660 restos au 14/11/2026).

- **Rechercher.** Dans la barre du haut, on peut taper une enseigne (« quick », « mcdo »), un type (« tacos », « poulet », « burger ») ou les deux avec une ville (« tacos rennes »). En haut de la carte : Tout, Burgers, Poulet, Tacos, et « Une enseigne… » pour en choisir une dans la liste.
- **Données.** Toutes viennent d'All The Places. Pour Chamas Tacos, les positions de la source sont souvent le centre de la ville : chaque nouveau resto est repositionné à partir de son adresse (Base Adresse Nationale). Les restos hors de France présents par erreur dans la source sont écartés.
- **Horaires.** Chicken Street et Chamas Tacos ne publient pas d'horaires : leurs restos ne sont jamais affichés « fermé ». Quand des horaires ne citent qu'un ou deux jours, ils sont ignorés (mieux vaut « pas d'info » qu'un faux « fermé »).
- **Ajouter une enseigne.** Dans `scripts/restos.py`, ajoute une ligne à `ENSEIGNES` (nom du fichier All The Places, lettre libre). Puis, dans `carte.html`, ajoute la même lettre dans `BR` (nom, type), `ICO` (icône), `BG` et `FG` (couleurs), et une ligne CSS `.bX`. La liste des enseignes disponibles est sur le site d'All The Places (alltheplaces.xyz).

## Mode jour et mode nuit

Le bouton « Mode nuit » / « Mode jour » est en haut du panneau. Le choix est gardé sur l'appareil. Sans choix, le site suit le réglage clair ou sombre du téléphone.

## Changer l'icône ou le nom

- Icône : remplace les fichiers du dossier `icons` (mêmes noms, mêmes tailles).
- Nom : « Narabu » apparaît dans `index.html` (présentation), `carte.html` (l'appli), `manifest.webmanifest`, `mentions.html` et `sw.js`.
- Images de la présentation : dossier `img/`. Remplace un fichier par un autre du même nom pour changer une affiche.
- L'appli installée sur le téléphone s'ouvre directement sur la carte (`start_url` dans `manifest.webmanifest`).

## Les limites du gratuit

- **Firebase** : 50 000 lectures et 20 000 écritures par jour. Chaque visiteur lit les infos des 2 dernières heures, puis seulement les nouvelles. C'est large pour démarrer ; si tu dépasses, la base s'arrête jusqu'au lendemain.
- **GitHub Pages** : site de 1 Go maximum, environ 100 Go de trafic par mois. Le dépôt doit rester public.
- **Open-Meteo** : gratuit pour un usage non commercial, environ 10 000 appels par jour. Si Narabu gagne de l'argent un jour (pub, abonnement), il faudra leur offre payante ou couper la météo (`meteo: false` dans `config.js`).
- **OpenFreeMap** : gratuit sans limite annoncée, mais sans garantie de service. Si la carte ne répond pas, le site passe sur un fond de secours.
- **Mises à jour GitHub** : elles peuvent partir avec quelques minutes de retard. GitHub peut les mettre en pause si le dépôt reste longtemps sans activité : il suffit alors de les réactiver dans l'onglet Actions.

## À savoir

- **L'estimation automatique repose sur des hypothèses**, pas sur des mesures : pics de midi et du soir, effet des écoles, des gares, de la pluie, capacité des restos. Elles sont écrites dans `modele.js`, avec un commentaire par règle. Plus les gens signalent, plus l'apprentissage les corrige.
- **Vie privée.** La position ne quitte jamais le téléphone : le site envoie seulement « sur place », « loin » ou « inconnu ». Chaque visiteur a un identifiant anonyme, sans nom ni e-mail. Si tu ouvres le site au public, ajoute une page de mentions légales et de confidentialité.
- **Logos.** Les pastilles sont des icônes maison. N'utilise pas les logos des enseignes sans leur accord.

## Ce qui a été testé, et ce qui ne l'a pas été

- Testé sur une base Firebase locale (émulateur officiel) : le temps réel entre deux appareils, les règles de sécurité (20 cas), l'apprentissage, la question automatique avec une position simulée, le chrono d'attente, la file, le comptage sur une photo d'exemple, les points, le classement, le ménage à 60 jours, le signalement de problème, le calendrier et la liste des restos.
- **Pas testé en vrai** : les deux fichiers de `.github/workflows` (il faut un compte GitHub), un vrai projet Firebase, l'appel réel à Open-Meteo (testé avec une réponse simulée), et l'installation sur un vrai téléphone (elle demande une adresse en https). Si une étape coince, regarde l'onglet **Actions** de GitHub : le message d'erreur y est écrit.

## Changer un réglage

Tout est dans `config.js` : `firebase`, `carte`, `meteo`, `position`, `photo`. Les autres fichiers n'ont pas besoin d'être touchés.
