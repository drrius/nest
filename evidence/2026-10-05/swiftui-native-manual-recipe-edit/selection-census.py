import json
from pathlib import Path

root = Path(__file__).parent
roles = {
    "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A": "Test Alex",
    "CA0BCEDE-A297-493A-8921-9E31F8B65783": "Test Sam",
}
counts = {name: {"sdkPassed": 0, "toolbarFailures": 0, "selectionFailures": 0, "probePassed": 0, "probeFailed": 0} for name in roles.values()}
for variant in ["initial", "after1", "after2", "selection-probe", "keyboard-probe", "keyboard-probe-success"]:
    path = root / variant / "results.json"
    if not path.exists():
        continue
    for result in json.loads(path.read_text()):
        actor = counts[roles[result["simulator"]]]
        if "HostedManualRecipeEditReadTests" in result["method"]:
            actor["sdkPassed"] += result["passed"]
        elif variant in ["selection-probe", "keyboard-probe", "keyboard-probe-success"]:
            actor["probePassed"] += result["passed"]
            actor["probeFailed"] += result["failed"]
        elif variant == "initial":
            actor["toolbarFailures"] += result["failed"]
        else:
            actor["selectionFailures"] += result["failed"]
print(json.dumps({"premise": "A long press alone opens Select All in this multi-line UITextField", "actors": counts}, indent=2))
