"""Verify saved evidence and the final native source inputs without hosted actions."""
import hashlib
import json
import subprocess
from pathlib import Path

EVIDENCE = Path(__file__).resolve().parent
ROOT = EVIDENCE.parents[2]
manifest = json.loads((EVIDENCE / "sha256.json").read_text())
formatted = [str(EVIDENCE / name) for name in manifest if Path(name).suffix in {".json", ".md"}]
subprocess.run(["pnpm", "exec", "oxfmt", "--check", *formatted], cwd=ROOT, check=True)
tracked = set(subprocess.check_output(["git", "ls-files", "--", str(EVIDENCE)], cwd=ROOT, text=True).splitlines())
for name, expected in manifest.items():
    assert str((EVIDENCE / name).relative_to(ROOT)) in tracked, f"Untracked evidence: {name}"
    path = EVIDENCE / name
    assert path.is_file(), f"Missing evidence: {name}"
    assert hashlib.sha256(path.read_bytes()).hexdigest() == expected, f"Changed evidence: {name}"
inputs = json.loads((EVIDENCE / "journey/final-source-inputs.json").read_text())
for name, expected in inputs.items():
    path = ROOT / "apps/ios" / name
    assert path.is_file(), f"Missing native source: {name}"
    assert hashlib.sha256(path.read_bytes()).hexdigest() == expected, f"Changed native source: {name}"
print(f"Verified {len(manifest)} evidence files and {len(inputs)} final native source inputs; no hosted actions.")
