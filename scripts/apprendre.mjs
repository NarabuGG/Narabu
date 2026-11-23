// Mise à jour automatique (lancée toutes les heures par GitHub).
// 1. Apprentissage : lit les nouvelles infos données par les gens dans la base Firebase, les compare à ce que le modèle
//    prévoyait à ce moment-là, et met à jour data/appris.json (l'écart moyen de chaque resto).
// 2. Classement : ajoute les points du mois dans data/classement.json (pseudos tirés au hasard, aucun identifiant publié).
//    Gardiens : pour chaque resto, la personne qui a donné le plus d'infos fiables ce mois-ci (les infos données de loin ne comptent pas).
//    Pseudos choisis dans la boutique : lus dans la collection « profils » (2 numéros de mots + un numéro de cadre).
// 3. Ménage (une fois par nuit) : supprime de la base les infos de plus de 60 jours.
// Chaque info n'est lue qu'une fois, donc ça ne consomme presque rien du quota gratuit.
process.env.TZ = 'Europe/Paris';            // le modèle raisonne en heure française
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const RACINE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const lire = f => JSON.parse(fs.readFileSync(path.join(RACINE, f), 'utf8'));
const ecrire = (f, o) => fs.writeFileSync(path.join(RACINE, f), JSON.stringify(o));
const ATTENTE = 90 * 60e3;                  // une info reste « en direct » 1 h 30 : on l'apprend seulement après
const OUBLI = 0.999;                        // par heure : une info pèse moitié moins au bout d'un mois environ
const GARDE = 60 * 86400e3;                 // durée de conservation des infos dans la base

const config = fs.readFileSync(path.join(RACINE, 'config.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');   // on ignore les commentaires (dont l'exemple)
const cle = nom => (config.match(new RegExp(nom + '\\s*:\\s*["\']([^"\']+)["\']')) || [])[1];
const projet = process.env.FOODLOC_PROJET || cle('projectId'), apiKey = process.env.FOODLOC_CLE || cle('apiKey');
if (!projet) { console.log('Pas de projet Firebase dans config.js : rien à faire pour l\'instant.'); process.exit(0); }
const BASE = process.env.FIRESTORE_BASE || 'https://firestore.googleapis.com';
const AUTH = process.env.AUTH_BASE || 'https://identitytoolkit.googleapis.com';
const DOCS = `${BASE}/v1/projects/${projet}/databases/(default)/documents`;

// même modèle que le site
const bac = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(RACINE, 'modele.js'), 'utf8') + ';this.M={auto,ZONE,setCalendar,bRep,wG,BL,PB,ptsOf}', bac);
const M = bac.M;
try { M.setCalendar(lire('data/calendrier.json')); } catch (e) {}
const restos = lire('data/restos.json'), feat = lire('data/feat.json'), parId = {};
restos.forEach((o, i) => { parId[o[0] + o[10]] = { f: feat[i] || Array(12).fill(0), z: M.ZONE[o[7]] || null, dr: o[9] }; });

const maintenant = Date.now(), jusque = maintenant - ATTENTE;
const val = v => v == null ? null : 'integerValue' in v ? Number(v.integerValue) : 'doubleValue' in v ? v.doubleValue : 'stringValue' in v ? v.stringValue
  : 'arrayValue' in v ? (v.arrayValue.values || []).map(val) : null;
const entier = n => ({ integerValue: String(Math.floor(n)) });
async function chercher(filtres, limite, jeton) {
  const requete = { structuredQuery: { from: [{ collectionId: 'reports' }], orderBy: [{ field: { fieldPath: 'ts' }, direction: 'ASCENDING' }], limit: limite,
    where: { compositeFilter: { op: 'AND', filters: filtres.map(([op, n]) => ({ fieldFilter: { field: { fieldPath: 'ts' }, op, value: entier(n) } })) } } } };
  const r = await fetch(`${DOCS}:runQuery`, { method: 'POST', headers: { 'content-type': 'application/json', ...(jeton ? { authorization: 'Bearer ' + jeton } : {}) }, body: JSON.stringify(requete) });
  if (!r.ok) throw new Error(`Firebase a répondu ${r.status} : ${(await r.text()).slice(0, 300)}`);
  return (await r.json()).filter(x => x.document).map(x => { const f = x.document.fields || {}, o = { _nom: x.document.name }; for (const k in f) o[k] = val(f[k]); return o; });
}

async function apprendre() {
  let appris; try { appris = lire('data/appris.json'); } catch (e) { appris = {}; }
  if (!appris.r) appris = { maj: 0, r: {} };
  let depuis = Math.max(appris.maj || 0, maintenant - GARDE);
  const nouvelles = [];
  for (let tour = 0; tour < 20; tour++) {
    const lot = await chercher([['GREATER_THAN', depuis], ['LESS_THAN_OR_EQUAL', jusque]], 1000);
    nouvelles.push(...lot);
    if (lot.length < 1000) break;
    depuis = lot[lot.length - 1].ts;
  }
  if (!nouvelles.length) { console.log('Aucune nouvelle info à apprendre.'); return; }

  // on atténue un peu l'ancien avant d'ajouter le nouveau
  const heures = appris.maj ? Math.max(0, (jusque - appris.maj) / 3600e3) : 0, k = Math.pow(OUBLI, heures);
  for (const id in appris.r) { appris.r[id] = appris.r[id].map(x => x * k); if (appris.r[id][0] < 0.05) delete appris.r[id]; }

  // classement du mois : remis à zéro quand le mois change
  const moisDe = ts => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  let rang; try { rang = lire('data/classement.json'); } catch (e) { rang = {}; }
  if (rang.mois !== moisDe(maintenant) || !rang.pts) rang = { mois: moisDe(maintenant), pts: {} };
  const dernier = {};                         // une seule info comptée par personne et par resto toutes les 30 minutes

  let prises = 0;
  for (const x of nouvelles) {
    const r = parId[x.r];
    if (!r || ![1, 2, 3].includes(x.l) || typeof x.ts !== 'number') continue;
    const info = { l: x.l, tg: Array.isArray(x.tg) ? x.tg.filter(t => typeof t === 'string') : [], g: x.g, w: x.w > 0 && x.w <= 90 ? x.w : 0, q: [1, 2, 3, 4].includes(x.q) ? x.q : 0, c: x.c > 0 && x.c <= 300 ? x.c : 0 };
    const poids = M.wG(info), ecart = M.bRep(info) - M.auto(r, new Date(x.ts));
    const a = appris.r[x.r] || (appris.r[x.r] = [0, 0, 0, 0]);      // [poids total, somme des écarts, nb de comptages, somme des capacités]
    a[0] += poids; a[1] += poids * ecart;
    const personnes = info.c || (M.PB[x.p] ? M.PB[x.p][1] : 0);      // comptage sur photo, sinon milieu de la fourchette
    if (personnes) { a[2] += 1; a[3] += personnes / Math.max(0.2, M.bRep(info)); }
    prises++;
    if (typeof x.u === 'string' && x.u.length > 5 && moisDe(x.ts) === rang.mois) {
      const cleU = x.u + '|' + x.r;
      if (!dernier[cleU] || x.ts - dernier[cleU] >= 30 * 60e3) {
        dernier[cleU] = x.ts;
        const h = crypto.createHash('sha256').update(x.u).digest('hex').slice(0, 10);   // l'identifiant n'est jamais publié, seulement cette empreinte
        rang.pts[h] = (rang.pts[h] || 0) + M.ptsOf(info);
        if (info.g !== -1) { const gp = rang.gp || (rang.gp = {}), pr = gp[x.r] || (gp[x.r] = {}); pr[h] = (pr[h] || 0) + M.ptsOf(info); }
      }
    }
  }
  for (const id in appris.r) appris.r[id] = appris.r[id].map(v => Math.round(v * 1000) / 1000);
  appris.maj = jusque;
  ecrire('data/appris.json', appris);
  rang.maj = jusque;
  gardiens(rang);
  ecrire('data/classement.json', rang);
  console.log(`${prises} info(s) apprise(s), ${Object.keys(appris.r).length} resto(s) ajusté(s), ${Object.keys(rang.pts).length} personne(s) au classement.`);
}

// Gardien d'un resto : le plus de points fiables ce mois-ci, au moins 15 (une info sur place)
function gardiens(rang) {
  rang.g = {};
  for (const [id, pr] of Object.entries(rang.gp || {})) {
    const top = Object.entries(pr).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= 15) rang.g[id] = [top[0], Math.round(top[1])];
  }
}

// pseudos et cadres choisis dans la boutique (collection « profils », lisible par tous, rien de personnel dedans)
async function noms() {
  let rang; try { rang = lire('data/classement.json'); } catch (e) { return; }
  const n = {}; let jeton = '', pages = 0;
  do {
    const r = await fetch(`${DOCS}/profils?pageSize=300${apiKey ? '&key=' + apiKey : ''}${jeton ? '&pageToken=' + encodeURIComponent(jeton) : ''}`);
    if (!r.ok) { console.log(`Pseudos sautés : Firebase a répondu ${r.status}.`); return; }
    const j = await r.json();
    for (const d of j.documents || []) {
      const f = d.fields || {}, a = val(f.a), b = val(f.n), c = val(f.c), id = d.name.split('/').pop();
      if (![a, b, c].every(Number.isInteger) || a < -1 || a > 11 || b < -1 || b > 11 || c < 0 || c > 5) continue;
      n[crypto.createHash('sha256').update(id).digest('hex').slice(0, 10)] = [a, b, c];
    }
    jeton = j.nextPageToken || ''; pages++;
  } while (jeton && pages < 20);
  if (JSON.stringify(n) === JSON.stringify(rang.n || {})) return;
  rang.n = n;
  ecrire('data/classement.json', rang);
  console.log(`${Object.keys(n).length} pseudo(s) choisi(s) dans la boutique.`);
}

// suppression des infos de plus de 60 jours (la base n'accepte les suppressions que d'un visiteur connecté, même anonyme)
async function menage() {
  if (!apiKey) return;
  const r = await fetch(`${AUTH}/v1/accounts:signUp?key=${apiKey}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) });
  if (!r.ok) { console.log('Ménage sauté : connexion anonyme refusée.'); return; }
  const jeton = (await r.json()).idToken;
  const vieilles = await chercher([['LESS_THAN', maintenant - GARDE]], 300);
  let n = 0;
  for (const v of vieilles) { const d = await fetch(`${BASE}/v1/${v._nom}`, { method: 'DELETE', headers: { authorization: 'Bearer ' + jeton } }); if (d.ok) n++; }
  console.log(`Ménage : ${n} info(s) de plus de 60 jours supprimée(s).`);
}

await apprendre();
try { await noms(); } catch (e) { console.log('Pseudos sautés :', e.message); }
if (process.env.FOODLOC_MENAGE === '1' || new Date().getHours() === 4) await menage();
