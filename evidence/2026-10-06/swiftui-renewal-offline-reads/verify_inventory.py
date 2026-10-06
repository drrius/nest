"""Check tracked evidence and the exact native source inputs without network actions."""
import hashlib
import json
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
tracked = set(subprocess.check_output(["git", "ls-files", "--", str(HERE)], cwd=ROOT, text=True).splitlines())
manifest = json.loads((HERE / "sha256.json").read_text())
for name, expected in manifest.items():
    path = HERE / name
    assert str(path.relative_to(ROOT)) in tracked, f"Untracked artifact: {name}"
    assert hashlib.sha256(path.read_bytes()).hexdigest() == expected, f"Changed artifact: {name}"
for label in ["integration", "online-ui"]:
    inputs = json.loads((HERE / label / "source-input-hashes.json").read_text())
    for name, expected in inputs.items():
        source = ROOT / "apps/ios" / name
        assert source.is_file(), f"Missing source: {name}"
        assert hashlib.sha256(source.read_bytes()).hexdigest() == expected, f"Changed source: {name}"
print(f"Verified {len(manifest)} tracked artifacts and {len(inputs)} native inputs for SDK and UI; no network actions.")
