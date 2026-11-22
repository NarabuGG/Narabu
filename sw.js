// Rend Narabu installable et utilisable quand le réseau coupe.
// Règle simple : on demande toujours la version la plus récente au réseau ; si le réseau ne répond pas, on sert la dernière copie gardée.
const CACHE = 'narabu-v8';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(noms => Promise.all(noms.filter(n => n !== CACHE).map(n => caches.delete(n)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;      // on ne touche pas à la carte, à la base ni à la météo
  e.respondWith(fetch(req).then(rep => {
    if (rep.ok) { const copie = rep.clone(); caches.open(CACHE).then(c => c.put(req, copie)); }
    return rep;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(m => m || Response.error())));
});
