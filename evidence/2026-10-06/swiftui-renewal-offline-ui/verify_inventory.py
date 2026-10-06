"""Verify tracked artifact hashes; optionally compare the current native source."""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
tracked = set(subprocess.check_output(['git', 'ls-files', '--', str(HERE)], cwd=ROOT, text=True).splitlines())
manifest = json.loads((HERE / 'sha256.json').read_text())
for name, digest in manifest.items():
    path = HERE / name
    assert str(path.relative_to(ROOT)) in tracked, f'Untracked artifact: {name}'
    assert hashlib.sha256(path.read_bytes()).hexdigest() == digest, f'Changed artifact: {name}'
if '--working-tree' in sys.argv:
    inputs = json.loads((HERE / 'source-input-hashes.json').read_text())
    for name, digest in inputs.items():
        assert hashlib.sha256((ROOT / 'apps/ios' / name).read_bytes()).hexdigest() == digest, f'Changed source: {name}'
    print(f'Verified {len(inputs)} current native inputs')
print(f'Verified {len(manifest)} tracked artifacts; no network actions')
