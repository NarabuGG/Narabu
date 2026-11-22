// Compteur de visites Narabu : un simple total par jour, sans identifiant ni adresse IP enregistrée.
// a = visites de l'accueil, c = visites de la carte, n = nouveaux visiteurs (première visite).
(function () {
  try {
    var cfg = (window.FOODLOC_CONFIG || {}).firebase, s = document.currentScript, page = s && s.dataset.p;
    if (!cfg || !cfg.apiKey || !page || /claude/.test(location.hostname) || location.protocol !== 'https:') return;
    var jour = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date());
    var cle = 'nb-vu-' + page + '-' + jour, champs = [];
    for (var i = localStorage.length - 1; i >= 0; i--) { var k = localStorage.key(i); if (k && k.indexOf('nb-vu-') === 0 && k.slice(-10) !== jour) localStorage.removeItem(k) }
    if (!localStorage.getItem(cle)) { localStorage.setItem(cle, '1'); champs.push(page) }
    if (!localStorage.getItem('nb-deja')) { localStorage.setItem('nb-deja', '1'); champs.push('n') }
    if (!champs.length) return;
    var base = 'projects/' + cfg.projectId + '/databases/(default)/documents';
    fetch('https://firestore.googleapis.com/v1/' + base + ':commit?key=' + cfg.apiKey, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
      body: JSON.stringify({ writes: [{ transform: { document: base + '/stats/' + jour,
        fieldTransforms: champs.map(function (f) { return { fieldPath: f, increment: { integerValue: '1' } } }) } }] })
    }).catch(function () {});
  } catch (e) {}
})();
