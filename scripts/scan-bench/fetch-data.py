#!/usr/bin/env python3
"""Testdaten für den Scanner-Messstand holen (nicht im Repo, da groß).

  python3 scripts/scan-bench/fetch-data.py <daten-ordner>

Erwartet <daten-ordner>/own-sets.txt mit "kürzel:anzahl ..." (aus welchen Sets
die Sammlung besteht) und lädt dazu passend zufällige Karten samt Bild von
Scryfall, außerdem das Namens-Wörterbuch und die Set-Liste.
"""
import json, os, random, subprocess, sys, time

out = sys.argv[1]
os.makedirs(f"{out}/img", exist_ok=True)
UA = ["-A", "mtg-scan-bench/1.0", "-H", "Accept: application/json"]


def get(url):
    r = subprocess.run(["curl", "-s", *UA, url], capture_output=True, text=True)
    try:
        return json.loads(r.stdout)
    except Exception:
        return {}


random.seed(7)
cards = []
for item in open(f"{out}/own-sets.txt").read().split():
    code, n = item.split(":")
    d = get(f"https://api.scryfall.com/cards/search?q=e%3A{code}+lang%3Aen&unique=prints&order=set")
    pool = [c for c in d.get("data", []) if c.get("image_uris") or c.get("card_faces", [{}])[0].get("image_uris")]
    for c in random.sample(pool, min(max(1, round(int(n) / 11)), len(pool))):
        uris = c.get("image_uris") or c["card_faces"][0]["image_uris"]
        front = c["name"].split(" // ")[0] if c.get("card_faces") and not c.get("image_uris") else c["name"]
        cards.append({"id": c["id"], "name": c["name"], "front": front, "set": c["set"], "number": c["collector_number"], "frame": c.get("frame"), "effects": c.get("frame_effects", []), "border": c.get("border_color"), "full_art": c.get("full_art"), "layout": c.get("layout"), "url": uris["large"]})
    time.sleep(0.12)
json.dump(cards, open(f"{out}/cards.json", "w"))
for c in cards:
    p = f"{out}/img/{c['id']}.jpg"
    if not os.path.exists(p):
        subprocess.run(["curl", "-s", "-o", p, c["url"]])
        time.sleep(0.05)
for name, url in [("names.json", "https://api.scryfall.com/catalog/card-names"), ("sets.json", "https://api.scryfall.com/sets")]:
    if not os.path.exists(f"{out}/{name}"):
        subprocess.run(["curl", "-s", *UA, "-o", f"{out}/{name}", url])
print(len(cards), "Karten")
