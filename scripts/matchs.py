#!/usr/bin/env python3
"""Matchs des 7 prochains jours pour la carte Narabu (data/matchs.json).

Source : TheSportsDB (API gratuite, clé publique « 123 »). On prend les journées
en cours et suivantes de chaque championnat, puis la position et la capacité
du stade (gardées dans data/stades.json pour ne pas les redemander).
Si la source ne répond pas, on garde l'ancien fichier.
"""
import json, os, re, sys, time, urllib.request
from datetime import datetime, timedelta, timezone

API = 'https://www.thesportsdb.com/api/v1/json/123/'
LIGUES = {  # id TheSportsDB : (sport, nom affiché)
    '4334': ('foot', 'Ligue 1'),
    '4401': ('foot', 'Ligue 2'),
    '4430': ('rugby', 'Top 14'),
    '4423': ('basket', 'Betclic Élite'),
    '4536': ('hand', 'Starligue'),
}
ICI = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ICI, '..', 'data')
F_MATCHS = os.path.join(DATA, 'matchs.json')
F_STADES = os.path.join(DATA, 'stades.json')
PAUSE = 3.0  # l'API gratuite accepte environ 30 appels par minute (on reste en dessous)


def get(chemin):
    req = urllib.request.Request(API + chemin, headers={'User-Agent': 'Narabu (github.com/NarabuGG/Narabu)'})
    for essai in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                time.sleep(PAUSE)
                return json.loads(r.read().decode('utf-8') or '{}') or {}
        except Exception as e:
            print('  appel raté', chemin, e)
            time.sleep(5 * (essai + 1))
    return None


def coords(txt):
    """Lit les formats vus dans la source :
    « 47.460458°N 0.530741°W », « 48°50′29″N 2°15′11″E », « 44.829167, -0.597778 »."""
    t = (txt or '').replace('′', "'").replace('’', "'").replace('″', '"').replace("''", '"')
    lat = lon = None
    # degrés (minutes, secondes) + lettre N/S/E/W
    parts = re.findall(r'(\d+(?:\.\d+)?)\s*°\s*(?:(\d+(?:\.\d+)?)\s*\'\s*)?(?:(\d+(?:\.\d+)?)\s*"\s*)?([NSEW])', t)
    if len(parts) >= 2:
        for d, mi, se, c in parts[:2]:
            v = float(d) + float(mi or 0) / 60 + float(se or 0) / 3600
            if c in 'NS':
                lat = -v if c == 'S' else v
            else:
                lon = -v if c == 'W' else v
    else:
        # deux nombres décimaux « lat, lon »
        nums = re.findall(r'-?\d+\.\d+', t)
        if len(nums) >= 2:
            lat, lon = float(nums[0]), float(nums[1])
    if lat is None or lon is None:
        return None
    # France métropolitaine et Monaco seulement
    if not (41.0 <= lat <= 51.6 and -5.6 <= lon <= 10.0):
        return None
    return round(lat, 5), round(lon, 5)


def charger(f, defaut):
    try:
        with open(f, encoding='utf-8') as h:
            return json.load(h)
    except Exception:
        return defaut


def garder(ancien, nom, matchs, vus, maintenant, fin):
    n = 0
    for m in ancien:
        if m.get('lg') == nom and m.get('id') not in vus and \
                (maintenant - timedelta(hours=4)).timestamp() * 1000 <= m.get('ts', 0) <= fin.timestamp() * 1000:
            vus.add(m['id']); matchs.append(m); n += 1
    return n


def main():
    maintenant = datetime.now(timezone.utc)
    fin = maintenant + timedelta(days=7)
    stades = charger(F_STADES, {})
    ancien = (charger(F_MATCHS, {}) or {}).get('m') or []
    vus, matchs, ok_ligues = set(), [], 0

    for lid, (sport, nom) in LIGUES.items():
        nxt = get(f'eventsnextleague.php?id={lid}')
        ev = (nxt or {}).get('events') or []
        complet = nxt is not None
        if not ev:
            print(nom, ': pas de prochain match trouvé')
            if not complet:
                garder(ancien, nom, matchs, vus, maintenant, fin)
            continue
        ok_ligues += 1
        saison = ev[0].get('strSeason')
        try:
            r0 = int(ev[0].get('intRound') or 0)
        except ValueError:
            r0 = 0
        tous = list(ev)
        if r0 > 0 and saison:
            for r in range(max(1, r0 - 1), r0 + 3):
                d = get(f'eventsround.php?id={lid}&r={r}&s={saison}')
                if d is None:
                    complet = False
                tous += (d or {}).get('events') or []
        n = 0
        for e in tous:
            eid = e.get('idEvent')
            ts = e.get('strTimestamp')
            if not eid or eid in vus or not ts:
                continue
            try:
                t = datetime.fromisoformat(ts.replace('Z', '')).replace(tzinfo=timezone.utc)
            except ValueError:
                continue
            if not (maintenant - timedelta(hours=4) <= t <= fin):
                continue
            if (e.get('strStatus') or '').lower() in ('postponed', 'cancelled', 'canceled', 'abandoned'):
                continue
            vid = e.get('idVenue')
            if not vid:
                continue
            if vid not in stades:
                v = ((get(f'lookupvenue.php?id={vid}') or {}).get('venues') or [None])[0]
                if v:
                    c = coords(v.get('strMap'))
                    try:
                        cap = int(v.get('intCapacity') or 0)
                    except ValueError:
                        cap = 0
                    stades[vid] = {'n': v.get('strVenue') or e.get('strVenue') or '', 'v': v.get('strLocation') or '',
                                   'lat': c[0] if c else None, 'lon': c[1] if c else None, 'cap': cap}
                else:
                    continue
            s = stades[vid]
            if s.get('lat') is None:
                continue
            vus.add(eid)
            dom, ext = e.get('strHomeTeam') or '', e.get('strAwayTeam') or ''
            matchs.append({'id': eid, 'sp': sport, 'lg': nom, 't': f'{dom} – {ext}' if dom and ext else (e.get('strEvent') or ''),
                           'ts': int(t.timestamp() * 1000), 'st': s['n'], 'lat': s['lat'], 'lon': s['lon'], 'cap': s.get('cap') or 0})
            n += 1
        if not complet:  # la source a raté un appel : on garde aussi les matchs déjà connus de ce championnat
            n += garder(ancien, nom, matchs, vus, maintenant, fin)
        print(f'{nom} : {n} match(s) dans les 7 prochains jours')

    if ok_ligues == 0:
        print('Source injoignable : on garde l\'ancien fichier.')
        return 0
    matchs.sort(key=lambda m: m['ts'])
    os.makedirs(DATA, exist_ok=True)
    with open(F_STADES, 'w', encoding='utf-8') as h:
        json.dump(stades, h, ensure_ascii=False, indent=0, sort_keys=True)
    with open(F_MATCHS, 'w', encoding='utf-8') as h:
        json.dump({'maj': maintenant.strftime('%Y-%m-%dT%H:%MZ'), 'source': 'TheSportsDB', 'm': matchs}, h, ensure_ascii=False, separators=(',', ':'))
    print(len(matchs), 'matchs écrits dans data/matchs.json')
    return 0


if __name__ == '__main__':
    sys.exit(main())
