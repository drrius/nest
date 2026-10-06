"""Verify saved evidence and the final native source inputs without hosted actions."""
import hashlib
import json
from pathlib import Path

EVIDENCE = Path(__file__).resolve().parent
ROOT = EVIDENCE.parents[2]
manifest = json.loads((EVIDENCE / "sha256.json").read_text())
for name, expected in manifest.items():
    path = EVIDENCE / name
    assert path.is_file(), f"Missing evidence: {name}"
    assert hashlib.sha256(path.read_bytes()).hexdigest() == expected, f"Changed evidence: {name}"
inputs = json.loads((EVIDENCE / "journey/final-source-inputs.json").read_text())
for name, expected in inputs.items():
    path = ROOT / "apps/ios" / name
    assert path.is_file(), f"Missing native source: {name}"
    assert hashlib.sha256(path.read_bytes()).hexdigest() == expected, f"Changed native source: {name}"
print(f"Verified {len(manifest)} evidence files and {len(inputs)} final native source inputs; no hosted actions.")
