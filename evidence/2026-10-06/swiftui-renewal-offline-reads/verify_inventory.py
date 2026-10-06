"""Check tracked evidence and the exact native source inputs without network actions."""
import argparse
import hashlib
import io
import json
import subprocess
import tarfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
tracked = set(subprocess.check_output(["git", "ls-files", "--", str(HERE)], cwd=ROOT, text=True).splitlines())
manifest = json.loads((HERE / "sha256.json").read_text())
formatted = [str(HERE / name) for name in manifest if Path(name).suffix in {".json", ".md"}]
subprocess.run(["pnpm", "exec", "oxfmt", "--check", *formatted], cwd=ROOT, check=True)
for name, expected in manifest.items():
    path = HERE / name
    assert str(path.relative_to(ROOT)) in tracked, f"Untracked artifact: {name}"
    assert hashlib.sha256(path.read_bytes()).hexdigest() == expected, f"Changed artifact: {name}"
parser = argparse.ArgumentParser(description=__doc__)
mode = parser.add_mutually_exclusive_group()
mode.add_argument("--source-ref", default="4ca7089e2ca17519866986338bd0308afa1b5d91")
mode.add_argument("--working-tree", action="store_true")
arguments = parser.parse_args()
source = "working tree" if arguments.working_tree else subprocess.check_output(
    ["git", "rev-parse", "--verify", arguments.source_ref + "^{commit}"], cwd=ROOT, text=True
).strip()
archived = None if arguments.working_tree else subprocess.check_output(["git", "archive", source, "apps/ios"], cwd=ROOT)
for label in ["integration", "online-ui"]:
    inputs = json.loads((HERE / label / "source-input-hashes.json").read_text())
    if archived is None:
        for name, expected in inputs.items():
            path = ROOT / "apps/ios" / name
            assert path.is_file(), f"Missing source: {name}"
            assert hashlib.sha256(path.read_bytes()).hexdigest() == expected, f"Changed source: {name}"
    else:
        with tarfile.open(fileobj=io.BytesIO(archived)) as archive:
            for name, expected in inputs.items():
                member = archive.extractfile("apps/ios/" + name)
                assert member is not None, f"Missing committed source: {name}"
                assert hashlib.sha256(member.read()).hexdigest() == expected, f"Changed committed source: {name}"
print(f"Verified {len(manifest)} tracked artifacts and {len(inputs)} native inputs at {source}; no network actions.")
