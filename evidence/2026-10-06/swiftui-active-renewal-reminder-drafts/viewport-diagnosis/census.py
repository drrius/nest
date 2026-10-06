import json
import sys
from pathlib import Path

rows = []
for name in sys.argv[1:]:
    path = Path(name)
    values = json.loads(path.read_text())
    rows.append({
        "source": str(path),
        "attempts": len(values),
        "missingAttempts": sum(not v["exists"] for v in values),
        "oversizedAttempts": sum(v["frame"][3] > v["bottom"] - v["top"] for v in values),
        "first": values[0],
        "last": values[-1],
    })
print(json.dumps({"premise": "A missing virtualized control can be located using only a caller-provided direction", "allFailuresRetained": True, "viewports": rows}, indent=2))
