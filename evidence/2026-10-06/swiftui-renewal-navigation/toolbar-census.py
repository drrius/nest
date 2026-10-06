import json
from pathlib import Path

root = Path(__file__).parent
cases = [
    ("before", "Add", "normal-renewal-bounds.json"),
    ("rounding-observer", "Add", "normal-untouched-add-bounds.json"),
    ("rounding-observer", "Cancel", "normal-untouched-cancel-bounds.json"),
]
rows = []
for phase, actor, filename in cases:
    nodes = json.loads((root / phase / filename).read_text())
    for node in nodes:
        rows.append({"phase": phase, "actor": actor, "frame": node["frame"]})
print(json.dumps({
    "premise": "Intrinsic text sizing inside a compact toolbar button keeps Cancel readable.",
    "actors": rows,
    "visualEvidence": {
        "modal-census/normal-census.png": "Cancel wraps as Can-cel in a44pt target.",
        "input-census/normal-census.png": "Intrinsic text sizing still clips Cancel in the compact target.",
    },
    "nextChange": "Keep the44pt target and semantic Cancel action; use the native close symbol.",
}, indent=2))
