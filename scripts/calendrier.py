#!/usr/bin/env python3
"""Met à jour data/calendrier.json : vacances scolaires officielles (zones A, B, C, Corse) et jours fériés.
Sources : data.education.gouv.fr (calendrier scolaire) et calendrier.api.gouv.fr (jours fériés). Gratuit, sans clé."""
import gzip, json, os, sys, time, urllib.parse, urllib.request, datetime
from zoneinfo import ZoneInfo

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SORTIE = os.path.join(RACINE, "data", "calendrier.json")
PARIS = ZoneInfo("Europe/Paris")
ZONES = {"Zone A": "A", "Zone B": "B", "Zone C": "C", "Corse": "Corse"}

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Narabu (mise a jour du calendrier)"})
    for essai in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                brut = r.read()
            if brut[:2] == b"\x1f\x8b":      # certains serveurs compressent même sans qu'on le demande
                brut = gzip.decompress(brut)
            return json.loads(brut)
        except Exception:
            if essai == 3:
                raise
            time.sleep(5 * (essai + 1))

def jour(iso):
    return datetime.datetime.fromisoformat(iso).astimezone(PARIS).date().isoformat()

def vacances(annee):
    base = "https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records"
    lignes, debut = [], 0
    while True:
        q = urllib.parse.urlencode({"limit": 100, "offset": debut, "where": f'annee_scolaire="{annee}"'})
        d = get(f"{base}?{q}")
        lignes += d.get("results", [])
        debut += 100
        if debut >= d.get("total_count", 0):
            return lignes

def main():
    auj = datetime.datetime.now(PARIS).date()
    a0 = auj.year if auj.month >= 8 else auj.year - 1
    groupes = {}
    for annee in (f"{a0}-{a0+1}", f"{a0+1}-{a0+2}"):
        for l in vacances(annee):
            z = ZONES.get(l.get("zones"))
            desc = (l.get("description") or "").strip()
            if not z or not desc.lower().startswith("vacances") or l.get("population") == "Enseignants":
                continue
            if not l.get("start_date") or not l.get("end_date"):
                continue
            # début = premier jour sans classe, fin = jour de la reprise (exclu)
            cle = (jour(l["start_date"]), jour(l["end_date"]), desc[0].upper() + desc[1:].replace("Hiver", "hiver").replace("Printemps", "printemps").replace("Été", "été"))
            groupes.setdefault(cle, set()).add(z)
    vac = [[a, b, sorted(z, key=lambda x: (len(x), x)), nom] for (a, b, nom), z in sorted(groupes.items()) if b > auj.isoformat()]
    feries = {}
    for an in (auj.year, auj.year + 1):
        feries[str(an)] = sorted(get(f"https://calendrier.api.gouv.fr/jours-feries/metropole/{an}.json").keys())
    if not vac or not all(feries.values()):
        sys.exit("Réponse vide : on garde l'ancien calendrier.")
    nouveau = {"vacances": vac, "feries": feries}
    try:
        ancien = json.load(open(SORTIE, encoding="utf-8"))
    except Exception:
        ancien = {}
    if {k: ancien.get(k) for k in nouveau} == nouveau:
        print("Calendrier déjà à jour.")
        return
    nouveau["maj"] = auj.isoformat()
    json.dump(nouveau, open(SORTIE, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"Calendrier mis à jour : {len(vac)} périodes de vacances.")

if __name__ == "__main__":
    main()
