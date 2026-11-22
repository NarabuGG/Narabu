// Réglages de Narabu. C'est le seul fichier à modifier.
window.FOODLOC_CONFIG = {
  // Colle ici la configuration de ton projet Firebase (voir LISEZ-MOI.md, étape 2).
  // Tant que c'est « null », les infos restent sur l'appareil de chacun (pas de partage).
  firebase: null,
  /* Exemple :
  firebase: {
    apiKey: "AIza...",
    authDomain: "mon-projet.firebaseapp.com",
    projectId: "mon-projet",
    appId: "1:123456:web:abcdef"
  },
  */
  carte: 'openfreemap',   // carte gratuite avec toutes les rues (OpenFreeMap)
  meteo: true,            // météo en direct (Open-Meteo, gratuit tant que le site n'est pas commercial)
  position: true,         // bouton « Autour de moi » et question automatique quand on est dans un resto
  // Comptage des personnes sur photo par une IA qui tourne dans le téléphone (la photo n'est jamais envoyée).
  // Désactivé par défaut : photographier des clients dans un resto est une zone grise en droit français.
  // Mets « true » seulement après avoir fait valider ce point (voir LISEZ-MOI.md).
  photo: false
};
