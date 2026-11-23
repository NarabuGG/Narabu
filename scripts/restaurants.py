#!/usr/bin/env python3
"""Liste des restaurants (restos assis, brasseries, bistrots, crêperies, pizzerias à table) de France,
tirée d'OpenStreetMap (© les contributeurs d'OpenStreetMap, licence ODbL).

Écrit data/rs/index.json (le nombre de restos par case) et une case par fichier : data/rs/<x>_<y>.json,
une case = 0,25° de côté (environ 20 km). Une case trop pleine (grandes villes) est coupée en petites cases
de 0,05° : data/rs/s<x>_<y>.json. La carte ne charge que les cases qu'on regarde.

Une ligne = [lat, lon, nom, type, horaires, réservation, options, adresse, code postal, ville, téléphone, site, cuisine, id]
  type : fr (français, brasserie), it (pizza, italien), cr (crêperie), as (asiatique), mo (monde), au (autre ou inconnu)
  réservation : 0 inconnu, 1 possible, 2 conseillée, 3 obligatoire, 4 pas de réservation
  options (addition) : 1 terrasse, 2 à emporter, 4 resto connu (Wikipédia, Michelin…), 8 accessible en fauteuil

Usage : python3 scripts/restaurants.py              (télécharge depuis Overpass)
        python3 scripts/restaurants.py fichier.json  (fichier Overpass déjà téléchargé)
"""
import json, math, os, sys, time, unicodedata, urllib.request, urllib.parse, datetime, glob

CELL = 0.25
SUB = 0.05
PLEIN = int(os.environ.get('PLEIN', 1500))
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'rs')
SERVEURS = ['https://overpass-api.de/api/interpreter',
            'https://overpass.kumi.systems/api/interpreter',
            'https://overpass.private.coffee/api/interpreter']
REQUETE = """[out:json][timeout:1500][maxsize:2000000000];
area["ISO3166-1"="FR"][admin_level=2]->.fr;
nwr["amenity"="restaurant"](area.fr);
out center tags qt;"""

# chaînes déjà dans l'onglet Fast-food : on ne les met pas deux fois
FAST = ['mcdonald', 'mac do', 'macdo', 'burger king', 'kfc', 'quick', 'o tacos', 'otacos', 'five guys', 'popeyes',
        'chicken street', 'chamas tacos', 'bioburger', 'subway', 'domino', 'pizza hut', 'starbucks']

def norm(s):
    s = unicodedata.normalize('NFD', s or '').encode('ascii', 'ignore').decode().lower()
    return ' '.join(s.replace("'", ' ').replace('-', ' ').replace('’', ' ').split())

CUIS = {  # cuisine OSM -> (type, étiquette)
    'french': ('fr', 'Français'), 'regional': ('fr', 'Cuisine régionale'), 'brasserie': ('fr', 'Brasserie'),
    'bistro': ('fr', 'Bistrot'), 'traditional': ('fr', 'Traditionnel'), 'savoyard': ('fr', 'Savoyard'),
    'alsatian': ('fr', 'Alsacien'), 'basque': ('fr', 'Basque'), 'provencal': ('fr', 'Provençal'), 'lyonnaise': ('fr', 'Bouchon lyonnais'),
    'seafood': ('fr', 'Fruits de mer'), 'fish': ('fr', 'Poisson'), 'steak_house': ('fr', 'Grill'), 'grill': ('fr', 'Grill'),
    'fine_dining': ('fr', 'Gastronomique'), 'gastronomic': ('fr', 'Gastronomique'), 'local': ('fr', 'Cuisine locale'),
    'pizza': ('it', 'Pizzeria'), 'italian': ('it', 'Italien'), 'italian_pizza': ('it', 'Pizzeria'), 'pasta': ('it', 'Pâtes'),
    'crepe': ('cr', 'Crêperie'), 'crepes': ('cr', 'Crêperie'), 'galette': ('cr', 'Crêperie'), 'creperie': ('cr', 'Crêperie'), 'breton': ('cr', 'Crêperie'),
    'asian': ('as', 'Asiatique'), 'chinese': ('as', 'Chinois'), 'japanese': ('as', 'Japonais'), 'sushi': ('as', 'Sushis'),
    'thai': ('as', 'Thaï'), 'vietnamese': ('as', 'Vietnamien'), 'korean': ('as', 'Coréen'), 'ramen': ('as', 'Ramen'),
    'cambodian': ('as', 'Cambodgien'), 'laotian': ('as', 'Laotien'), 'wok': ('as', 'Wok'), 'noodle': ('as', 'Nouilles'),
    'indian': ('mo', 'Indien'), 'pakistani': ('mo', 'Pakistanais'), 'lebanese': ('mo', 'Libanais'), 'moroccan': ('mo', 'Marocain'),
    'tunisian': ('mo', 'Tunisien'), 'algerian': ('mo', 'Algérien'), 'couscous': ('mo', 'Couscous'), 'turkish': ('mo', 'Turc'),
    'greek': ('mo', 'Grec'), 'mexican': ('mo', 'Mexicain'), 'tex-mex': ('mo', 'Tex-Mex'), 'spanish': ('mo', 'Espagnol'),
    'tapas': ('mo', 'Tapas'), 'portuguese': ('mo', 'Portugais'), 'african': ('mo', 'Africain'), 'senegalese': ('mo', 'Sénégalais'),
    'ethiopian': ('mo', 'Éthiopien'), 'american': ('mo', 'Américain'), 'burger': ('mo', 'Burgers'), 'peruvian': ('mo', 'Péruvien'),
    'brazilian': ('mo', 'Brésilien'), 'argentinian': ('mo', 'Argentin'), 'russian': ('mo', 'Russe'), 'georgian': ('mo', 'Géorgien'),
    'persian': ('mo', 'Persan'), 'afghan': ('mo', 'Afghan'), 'kebab': ('mo', 'Kebab'), 'mediterranean': ('mo', 'Méditerranéen'),
    'caribbean': ('mo', 'Antillais'), 'creole': ('mo', 'Créole'), 'reunionese': ('mo', 'Réunionnais'), 'international': ('mo', 'International'),
    'vegetarian': ('au', 'Végétarien'), 'vegan': ('au', 'Vegan'), 'salad': ('au', 'Salades'), 'sandwich': ('au', 'Sandwichs'),
}
RES = {'yes': 1, 'recommended': 2, 'required': 3, 'only': 3, 'no': 4}

def ligne(e):
    t = e.get('tags') or {}
    nom = (t.get('name') or '').strip()
    if not nom or t.get('amenity') != 'restaurant':
        return None
    if t.get('disused:amenity') or t.get('opening_hours') == 'closed':
        return None
    nn = norm(nom + ' ' + t.get('brand', ''))
    if any((' ' + f + ' ') in (' ' + nn + ' ') for f in FAST):
        return None
    lat = e.get('lat', (e.get('center') or {}).get('lat'))
    lon = e.get('lon', (e.get('center') or {}).get('lon'))
    if lat is None or lon is None:
        return None
    typ, lab = 'au', ''
    for c in (t.get('cuisine') or '').lower().replace(',', ';').split(';'):
        c = c.strip()
        if c in CUIS:
            typ, lab = CUIS[c]
            break
    if typ == 'au' and not lab:  # le nom aide souvent : « Crêperie du port », « Pizzeria Roma »
        n = norm(nom)
        for mots, ty, lb in ((('creperie', 'galette', 'crepe'), 'cr', 'Crêperie'), (('pizz',), 'it', 'Pizzeria'),
                             (('brasserie',), 'fr', 'Brasserie'), (('bistro',), 'fr', 'Bistrot'), (('sushi',), 'as', 'Sushis')):
            if any(m in n for m in mots):
                typ, lab = ty, lb
                break
    opt = (1 if t.get('outdoor_seating') == 'yes' else 0) | (2 if t.get('takeaway') in ('yes', 'only') else 0) \
        | (4 if (t.get('wikidata') or t.get('wikipedia') or t.get('michelin') or t.get('stars')) else 0) \
        | (8 if t.get('wheelchair') == 'yes' else 0)
    adr = ' '.join(x for x in (t.get('addr:housenumber', ''), t.get('addr:street', '')) if x).strip()
    tel = t.get('phone') or t.get('contact:phone') or ''
    web = t.get('website') or t.get('contact:website') or ''
    if web and not web.startswith('http'):
        web = 'https://' + web
    return [round(lat, 5), round(lon, 5), nom[:80], typ, (t.get('opening_hours') or '')[:200],
            RES.get((t.get('reservation') or '').lower(), 0), opt, adr[:90], (t.get('addr:postcode') or '')[:5],
            (t.get('addr:city') or '')[:50], tel[:30], web[:150], lab, e['type'][0] + str(e['id'])]

def telecharger():
    corps = urllib.parse.urlencode({'data': REQUETE}).encode()
    for essai in range(3):
        for url in SERVEURS:
            try:
                print('Overpass :', url, flush=True)
                req = urllib.request.Request(url, data=corps, headers={'User-Agent': 'Narabu (narabu.fr@gmail.com)'})
                with urllib.request.urlopen(req, timeout=1800) as r:
                    d = json.load(r)
                if len(d.get('elements', [])) > 20000:
                    return d['elements']
                print('  trop peu de restos, on essaie ailleurs', len(d.get('elements', [])))
            except Exception as ex:
                print('  échec :', ex, flush=True)
        time.sleep(60)
    raise SystemExit('Overpass ne répond pas : on garde l\'ancienne liste.')

def main():
    if len(sys.argv) > 1:
        els = json.load(open(sys.argv[1]))
        els = els.get('elements', els) if isinstance(els, dict) else els
    else:
        els = telecharger()
    cases, vus = {}, set()
    for e in els:
        l = ligne(e)
        if not l or l[-1] in vus:
            continue
        vus.add(l[-1])
        k = f'{math.floor(l[1] / CELL)}_{math.floor(l[0] / CELL)}'
        cases.setdefault(k, []).append(l)
    os.makedirs(OUT, exist_ok=True)
    for f in glob.glob(os.path.join(OUT, '*.json')):
        os.remove(f)
    idx = {}
    def ecrire(nom, ls):
        ls.sort(key=lambda l: (-(l[6] & 4), l[2]))
        with open(os.path.join(OUT, nom + '.json'), 'w', encoding='utf-8') as f:
            json.dump(ls, f, ensure_ascii=False, separators=(',', ':'))
    for k, ls in cases.items():
        coupe = len(ls) > PLEIN
        if coupe:
            sous = {}
            for l in ls:
                sous.setdefault(f's{math.floor(l[1] / SUB + 1e-9)}_{math.floor(l[0] / SUB + 1e-9)}', []).append(l)
            for sk, sl in sous.items():
                ecrire(sk, sl)
        else:
            ecrire(k, ls)
        idx[k] = [len(ls), round(sum(l[0] for l in ls) / len(ls), 4), round(sum(l[1] for l in ls) / len(ls), 4), 1 if coupe else 0]
    total = sum(v[0] for v in idx.values())
    with open(os.path.join(OUT, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump({'v': datetime.date.today().isoformat(), 'c': CELL, 'sc': SUB, 'n': total,
                   'src': '© les contributeurs d\'OpenStreetMap (ODbL)', 't': idx}, f, ensure_ascii=False, separators=(',', ':'))
    print(f'{total} restaurants dans {len(idx)} cases')

if __name__ == '__main__':
    main()
