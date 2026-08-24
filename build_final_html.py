import json, os

root = os.path.dirname(os.path.abspath(__file__))

with open(os.path.join(root, "data", "sample_items_audio.json"), "r", encoding="utf-8") as f:
    items = json.load(f)

# drop the raw filename fields, keep only what the front-end needs
clean = []
for it in items:
    clean.append({
        "word": it["word"],
        "reading": it["reading"],
        "meaning": it["meaning"],
        "sentence": it["sentence"],
        "sentenceMeaning": it["sentenceMeaning"],
        "wordAudioB64": it.get("wordAudioB64"),
        "sentenceAudioB64": it.get("sentenceAudioB64"),
    })

items_json = json.dumps(clean, ensure_ascii=False)

with open(os.path.join(root, "kaishi_drill_template.html"), "r", encoding="utf-8") as f:
    template = f.read()

if "__ITEMS_JSON__" not in template:
    raise SystemExit("placeholder not found in template!")

final = template.replace("__ITEMS_JSON__", items_json)

out_path = os.path.join(root, "kaishi_drill.html")
with open(out_path, "w", encoding="utf-8") as f:
    f.write(final)

print("Final file size: %.2f MB" % (len(final.encode("utf-8")) / 1_000_000))
print("Items embedded:", len(clean))
print("Items with word audio:", sum(1 for c in clean if c["wordAudioB64"]))
print("Items with sentence audio:", sum(1 for c in clean if c["sentenceAudioB64"]))
