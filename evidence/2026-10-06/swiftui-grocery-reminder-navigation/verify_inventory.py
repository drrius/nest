#!/usr/bin/env python3
"""Verify bounded exported reminder evidence without reading private bundles."""
import argparse
import hashlib
import io
import json
import re
import subprocess
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify_files():
    inventory = json.loads((HERE / 'sha256.json').read_text())
    actual = {str(p.relative_to(HERE)) for p in HERE.rglob('*') if p.is_file() and p.name != 'sha256.json'}
    assert set(inventory) == actual, 'Exported inventory differs'
    tracked = set(subprocess.check_output(['git', 'ls-files', '--', str(HERE.relative_to(ROOT))], cwd=ROOT, text=True).splitlines())
    assert {str((HERE / p).relative_to(ROOT)) for p in actual | {'sha256.json'}} <= tracked, 'Untracked export'
    for name, expected in inventory.items():
        path = HERE / name
        assert digest(path) == expected, name
        if path.suffix in {'.json', '.md', '.txt', '.py', '.swift'}:
            value = path.read_text()
            assert not re.search(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.', value), name
            assert not re.search(r'Bearer\s+[A-Za-z0-9_.-]+', value, re.I), name
            assert not re.search(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----', value), name
    return inventory, actual


def verify_attachments():
    references = 0
    for path in HERE.rglob('manifest.json'):
        for test in json.loads(path.read_text()):
            for attachment in test['attachments']:
                assert (path.parent / attachment['exportedFileName']).is_file(), path
                references += 1
    return references


def verify_sources(working_tree, source_ref):
    pins = json.loads((HERE / 'source-pinning.json').read_text())
    final = json.loads((HERE / pins['finalUI']).read_text())
    shipping = {k: v for k, v in final.items() if k.startswith('Nest/') or k.startswith('Nest.xcodeproj/')}
    for name in [pins['normalUI'], pins['maximumPrefixUI'], pins['finalSDK']]:
        source = json.loads((HERE / name).read_text())
        assert all(source.get(k) == v for k, v in shipping.items()), name
    sdk = json.loads((HERE / pins['finalSDK']).read_text())
    for key, value in final.items():
        if key.startswith(('AppTests/', 'Tests/')):
            assert sdk.get(key) == value, key
    if working_tree:
        for key, value in final.items():
            assert digest(ROOT / 'apps/ios' / key) == value, key
    else:
        source_ref = subprocess.check_output(
            ['git', 'rev-parse', '--verify', source_ref + '^{commit}'], cwd=ROOT, text=True
        ).strip()
        archived = subprocess.check_output(['git', 'archive', source_ref, 'apps/ios'], cwd=ROOT)
        with tarfile.open(fileobj=io.BytesIO(archived)) as archive:
            for key, value in final.items():
                member = archive.extractfile('apps/ios/' + key)
                assert member is not None, key
                assert hashlib.sha256(member.read()).hexdigest() == value, key
    return len(shipping)


def verify_review(inventory, actual):
    review = json.loads((HERE / 'reviewed-screenshots.json').read_text())
    assert set(review) == {name for name in actual if name.endswith('.png')}
    assert all(row['sha256'] == inventory[name] and row['safeFictionalScope'] for name, row in review.items())
    return len(review)


def verify():
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--working-tree', action='store_true')
    mode.add_argument('--source-ref', default='1c0cb05460f8b74f3191f5751f413523cbbf69c7')
    args = parser.parse_args()
    inventory, actual = verify_files()
    references = verify_attachments()
    shipping = verify_sources(args.working_tree, args.source_ref)
    reviewed = verify_review(inventory, actual)
    print(json.dumps({'files': len(actual) + 1, 'attachmentReferences': references, 'shippingInputs': shipping, 'PNGReviewed': reviewed, 'workingTreeChecked': args.working_tree, 'passed': True}))


if __name__ == '__main__':
    verify()
