import collections
import json
import sys
from pathlib import Path


def position(issue):
    left, top, width, height = issue["frame"]
    bar_top = issue["tabBarFrame"][1]
    if not width or not height:
        return "unbound"
    if top >= bar_top:
        return "below_bar"
    if top + height > bar_top:
        return "crosses_bar"
    if top + height >= bar_top - 64:
        return "within_64pt_of_bar"
    return "clear_above_bar"


def census(path):
    issues = json.loads(path.read_text())
    counts = collections.Counter()
    actors = collections.Counter()
    for issue in issues:
        counts[(issue["summary"], position(issue))] += 1
        actors[(issue["case"], issue["label"] or "<unbound>", issue["summary"])] += 1
    return {
        "source": str(path),
        "reportCount": len(issues),
        "allReportsRetained": True,
        "proximityBandIsDiagnosticNotExemption": True,
        "positions": [
            {"summary": summary, "position": location, "reports": count}
            for (summary, location), count in sorted(counts.items())
        ],
        "actors": [
            {"case": case, "label": label, "summary": summary, "reports": count}
            for (case, label, summary), count in sorted(actors.items())
        ],
    }


if __name__ == "__main__":
    print(json.dumps(census(Path(sys.argv[1])), indent=2))
