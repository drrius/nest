"""Check tracked artifacts and recorded shipping inputs without network actions."""
import hashlib
import io
import json
import subprocess
import tarfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
tracked = set(subprocess.check_output(['git', 'ls-files', '--', str(HERE)], cwd=ROOT, text=True).splitlines())
manifest = json.loads((HERE / 'sha256.json').read_text())
for name, digest in manifest.items():
    file = HERE / name
    assert str(file.relative_to(ROOT)) in tracked, f'Untracked artifact: {name}'
    assert hashlib.sha256(file.read_bytes()).hexdigest() == digest, f'Changed artifact: {name}'
for case in json.loads((HERE / 'manifest.json').read_text()):
    for attachment in case['attachments']:
        assert attachment['exportedFileName'] in manifest, 'Untracked exported attachment'
shipping = json.loads((HERE / 'shipping-source-inputs.json').read_text())
archive = subprocess.check_output(['git', 'archive', shipping['commit'], 'apps/ios/Nest', 'apps/ios/Nest.xcodeproj'], cwd=ROOT)
with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
    for name, digest in shipping['inputs'].items():
        assert hashlib.sha256(tar.extractfile('apps/ios/' + name).read()).hexdigest() == digest, f'Changed shipping input: {name}'
print(f"Verified {len(manifest)} tracked artifacts and {len(shipping['inputs'])} recorded shipping inputs")
