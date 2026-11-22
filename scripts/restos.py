#!/usr/bin/env python3
"""Met à jour data/restos.json (ouvertures, fermetures, horaires) à partir des sites officiels des enseignes,
via la base ouverte All The Places (alltheplaces.xyz). Lancé une fois par semaine par GitHub. Gratuit, sans clé.
Les indices « autour du resto » (data/feat.json) sont gardés pour les restos connus ; un nouveau resto démarre à zéro."""
import gzip, json, os, re, sys, time, urllib.request

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = lambda f: os.path.join(RACINE, "data", f)
ENSEIGNES = [("mcdonalds_fr", "m"), ("burger_king_fr", "b"), ("kfc_fr", "k")]

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

def dans(x, y, anneau):
    c, j = False, len(anneau) - 1
    for i in range(len(anneau)):
        xi, yi = anneau[i][:2]; xj, yj = anneau[j][:2]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            c = not c
        j = i
    return c

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

    ancien = json.load(open(D("restos.json"), encoding="utf-8"))
    anciens_feat = json.load(open(D("feat.json"), encoding="utf-8"))
    feat_par_id = {o[0] + str(o[10]): anciens_feat[i] for i, o in enumerate(ancien) if i < len(anciens_feat)}
    dep_par_id = {o[0] + str(o[10]): o[7] for o in ancien}

    run = get("https://data.alltheplaces.xyz/runs/latest.json")
    base = run["output_url"].rsplit("/", 1)[0] + "/output"
    nouveau = []
    for spider, b in ENSEIGNES:
        lot = []
        for f in get(f"{base}/{spider}.geojson")["features"]:
            p, g = f["properties"], f.get("geometry")
            if not g or not p.get("ref"):
                continue
            x, y = g["coordinates"][:2]
            adr = p.get("addr:street_address") or p.get("addr:full") or ""
            m = re.search(r"\b(\d{5})\b", adr)
            cp = p.get("addr:postcode") or (m.group(1) if m else "")
            ville = (p.get("addr:city") or "").strip().title()
            if not ville and p.get("addr:full"):
                m = re.search(r"\d{5}\s+(.+)$", p["addr:full"])
                ville = m.group(1).strip().title() if m else ""
            ident = b + str(p["ref"])
            drive = 1 if p.get("drive_through") == "yes" or "opening_hours:drive_through" in p else 0
            lot.append([b, round(y, 5), round(x, 5), p.get("branch") or ville or "", adr, cp, ville,
                        dep_par_id.get(ident) or departement(x, y, cp), p.get("opening_hours", ""), drive, str(p["ref"])])
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
