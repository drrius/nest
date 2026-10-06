"""Verify saved evidence and the final native source inputs without hosted actions."""
import argparse
import hashlib
import io
import json
import subprocess
import tarfile
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
parser = argparse.ArgumentParser(description=__doc__)
mode = parser.add_mutually_exclusive_group()
mode.add_argument("--source-ref", default="33ba6ae3099fba746738249463729cabc8c96570")
mode.add_argument("--working-tree", action="store_true")
arguments = parser.parse_args()
inputs = json.loads((EVIDENCE / "journey/final-source-inputs.json").read_text())
if arguments.working_tree:
    for name, expected in inputs.items():
        path = ROOT / "apps/ios" / name
        assert path.is_file(), f"Missing native source: {name}"
        assert hashlib.sha256(path.read_bytes()).hexdigest() == expected, f"Changed native source: {name}"
    source = "working tree"
else:
    source = subprocess.check_output(
        ["git", "rev-parse", "--verify", arguments.source_ref + "^{commit}"], cwd=ROOT, text=True
    ).strip()
    archived = subprocess.check_output(["git", "archive", source, "apps/ios"], cwd=ROOT)
    with tarfile.open(fileobj=io.BytesIO(archived)) as archive:
        for name, expected in inputs.items():
            member = archive.extractfile("apps/ios/" + name)
            assert member is not None, f"Missing committed native source: {name}"
            assert hashlib.sha256(member.read()).hexdigest() == expected, f"Changed committed native source: {name}"
print(f"Verified {len(manifest)} evidence files and {len(inputs)} native source inputs at {source}; no hosted actions.")
