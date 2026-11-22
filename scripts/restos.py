#!/usr/bin/env python3
"""Met à jour data/restos.json (ouvertures, fermetures, horaires) à partir des sites officiels des enseignes,
via la base ouverte All The Places (alltheplaces.xyz). Lancé une fois par semaine par GitHub. Gratuit, sans clé.
Les indices « autour du resto » (data/feat.json) sont gardés pour les restos connus ; un nouveau resto démarre à zéro.
Si une adresse n'a pas de ville, on la demande à geo.api.gouv.fr (service public, gratuit)."""
import gzip, json, os, re, sys, time, urllib.parse, urllib.request

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = lambda f: os.path.join(RACINE, "data", f)
# (nom du fichier All The Places, lettre de l'enseigne dans Narabu). Les fichiers sans « _fr » couvrent
# plusieurs pays : on ne garde que la France.
ENSEIGNES = [("mcdonalds_fr", "m"), ("burger_king_fr", "b"), ("kfc_fr", "k"), ("quick_fr", "q"),
             ("o_tacos", "o"), ("five_guys_fr", "f"), ("popeyes", "p"), ("chicken_street", "c"),
             ("chamas_tacos_fr", "t"), ("bioburger_fr", "i")]
# La France avec l'outre-mer (les fichiers « _fr » sont gardés en entier, comme avant).
FRANCE = {"FR", "RE", "GP", "MQ", "GF", "YT", "PM", "BL", "MF", "NC", "PF", "WF"}
# Enseignes dont les positions sont approximatives à la source (souvent le centre de la ville) :
# on repositionne chaque nouveau resto à partir de son adresse, avec la Base Adresse Nationale (service public, gratuit).
A_REPOSITIONNER = {"chamas_tacos_fr"}
JOURS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Narabu (mise a jour des restos)"})
    for essai in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                brut = r.read()
            if brut[:2] == b"\x1f\x8b":
                brut = gzip.decompress(brut)
            return json.loads(brut)
        except Exception:
            if essai == 3:
                raise
            time.sleep(5 * (essai + 1))

def jours_couverts(oh):
    """Nombre de jours de la semaine cités dans les horaires. Des horaires qui ne citent qu'un ou deux jours
    sont incomplets à la source : mieux vaut « pas d'info » que d'afficher le resto fermé à tort."""
    if not oh or oh.strip() == "24/7":
        return 7
    vus = set()
    for a, b in re.findall(r"\b(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?\b", oh):
        i = JOURS.index(a); j = JOURS.index(b) if b else i
        k = i
        while True:
            vus.add(k)
            if k == j:
                break
            k = (k + 1) % 7
    return len(vus)

def dans(x, y, anneau):
    c, j = False, len(anneau) - 1
    for i in range(len(anneau)):
        xi, yi = anneau[i][:2]; xj, yj = anneau[j][:2]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            c = not c
        j = i
    return c

def commune(x, y):
    try:
        q = urllib.parse.urlencode({"lat": y, "lon": x, "fields": "nom,codesPostaux"})
        r = get("https://geo.api.gouv.fr/communes?" + q)
        if r:
            return r[0]["nom"], (r[0].get("codesPostaux") or [""])[0]
    except Exception:
        pass
    return "", ""

def adresse(adr, cp, ville):
    try:
        q = urllib.parse.urlencode({"q": " ".join(v for v in (adr, cp, ville) if v), "limit": 1})
        r = get("https://api-adresse.data.gouv.fr/search/?" + q)["features"]
        if r and r[0]["properties"]["score"] >= 0.6 and r[0]["properties"]["type"] in ("housenumber", "street"):
            return r[0]["geometry"]["coordinates"][:2]
    except Exception:
        pass
    return None

def main():
    deps = []
    for f in json.load(open(D("deps.json"), encoding="utf-8"))["features"]:
        g = f["geometry"]
        deps.append((f["properties"]["code"], g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]))
    def departement(x, y, cp):
        for code, polys in deps:
            for poly in polys:
                if dans(x, y, poly[0]) and not any(dans(x, y, t) for t in poly[1:]):
                    return code
        return (cp[:3] if cp.startswith("97") else cp[:2]) or "?"
    def en_france(x, y):
        return any(dans(x, y, poly[0]) for _, polys in deps for poly in polys)

    ancien = json.load(open(D("restos.json"), encoding="utf-8"))
    anciens_feat = json.load(open(D("feat.json"), encoding="utf-8"))
    feat_par_id = {o[0] + str(o[10]): anciens_feat[i] for i, o in enumerate(ancien) if i < len(anciens_feat)}
    par_id = {o[0] + str(o[10]): o for o in ancien}

    run = get("https://data.alltheplaces.xyz/runs/latest.json")
    base = run["output_url"].rsplit("/", 1)[0] + "/output"
    nouveau = []
    for spider, b in ENSEIGNES:
        lot = []
        for f in get(f"{base}/{spider}.geojson")["features"]:
            p, g = f["properties"], f.get("geometry")
            if not g or not p.get("ref"):
                continue
            pays = p.get("addr:country")
            if pays and pays not in FRANCE and not spider.endswith("_fr"):
                continue
            x, y = g["coordinates"][:2]
            ident = b + str(p["ref"])
            vieux = par_id.get(ident)
            if not vieux and not en_france(x, y) and not (pays in FRANCE and pays != "FR"):
                continue                # hors de France (erreurs de pays à la source)
            adr = p.get("addr:street_address") or p.get("addr:full") or ""
            m = re.search(r"\b(\d{5})\b", adr)
            cp = p.get("addr:postcode") or (m.group(1) if m else "")
            ville = (p.get("addr:city") or "").strip().title()
            if not ville and p.get("addr:full"):
                m = re.search(r"\d{5}\s+([^\d,]+)$", p["addr:full"])
                ville = m.group(1).strip().title() if m else ""
            if not ville or not cp:
                if vieux and vieux[6] and vieux[5]:
                    ville, cp = ville or vieux[6], cp or vieux[5]
                else:
                    v2, c2 = commune(x, y)
                    ville, cp = ville or v2, cp or c2
            if spider in A_REPOSITIONNER:
                if vieux:
                    y, x = vieux[1], vieux[2]
                else:
                    pos = adresse(adr, cp, ville)
                    if pos:
                        x, y = pos
            drive = 1 if p.get("drive_through") == "yes" or "opening_hours:drive_through" in p else 0
            oh = p.get("opening_hours", "")
            if jours_couverts(oh) < 5:
                oh = ""
            lot.append([b, round(y, 5), round(x, 5), p.get("branch") or ville or "", adr, cp, ville,
                        (vieux[7] if vieux else "") or departement(x, y, cp), oh, drive, str(p["ref"])])
        avant = sum(1 for o in ancien if o[0] == b)
        if len(lot) < 0.7 * avant:      # sécurité : si la source est en panne, on ne casse pas la carte
            sys.exit(f"{spider} : seulement {len(lot)} restos contre {avant} avant. On garde l'ancienne liste.")
        print(f"{spider} : {len(lot)} restos (avant : {avant})")
        nouveau += lot
    if nouveau == ancien:
        print("Liste déjà à jour.")
        return
    feat = [feat_par_id.get(o[0] + o[10], [0] * 12) for o in nouveau]
    json.dump(nouveau, open(D("restos.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    json.dump(feat, open(D("feat.json"), "w", encoding="utf-8"), separators=(",", ":"))
    ids_avant, ids_apres = set(feat_par_id), {o[0] + o[10] for o in nouveau}
    print(f"Liste mise à jour : {len(ids_apres - ids_avant)} ouverture(s), {len(ids_avant - ids_apres)} fermeture(s).")

if __name__ == "__main__":
    main()
