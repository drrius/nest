import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
paths = list((ROOT / "evidence/2026-10-05/swiftui-accessibility-audit").glob("test*.json"))
paths += list((ROOT / "evidence/2026-10-07/swiftui-visible-root-contrast").rglob("*.json"))
paths += [Path(__file__).with_name("finding.json")]
rows = []
for path in sorted(paths):
    value = json.loads(path.read_text())
    if not isinstance(value, dict):
        continue
    findings = value.get("findings", [value])
    counts = dict(above=0, crossing=0, below=0, unidentified=0)
    for finding in findings:
        if finding.get("summary") != "Contrast failed":
            continue
        frame = finding.get("frame", [0, 0, 0, 0])
        bar = finding.get("tabBarFrame", [0, 584, 0, 0])
        y, height = frame[1], frame[3]
        position = (
            "unidentified" if frame[2] == 0 or height == 0
            else "below" if y >= bar[1]
            else "above" if y + height <= bar[1]
            else "crossing"
        )
        counts[position] += 1
    if sum(counts.values()):
        rows.append(dict(source=str(path.relative_to(ROOT)), contrast=counts))
print(json.dumps(dict(
    premise="Earlier visual fixes assumed color or scroll-edge styling would remove findings behind the floating native tab bar.",
    rows=rows,
    limitations="Historical and current source states differ. Position is evidence, not proof of the cause or accessibility approval."
), indent=2))
