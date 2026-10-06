#!/usr/bin/env python3
"""Check exported reminder readability evidence without private native payloads."""
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
    assert set(inventory) == actual
    tracked = set(subprocess.check_output(['git', 'ls-files', '--', str(HERE.relative_to(ROOT))], cwd=ROOT, text=True).splitlines())
    assert {str((HERE / p).relative_to(ROOT)) for p in actual | {'sha256.json'}} <= tracked
    for name, expected in inventory.items():
        path = HERE / name
        assert digest(path) == expected, name
        if path.suffix in {'.json', '.md', '.txt', '.py'}:
            text = path.read_text()
            assert not re.search(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.', text), name
            assert not re.search(r'Bearer\s+[A-Za-z0-9_.-]+', text, re.I), name
            assert not re.search(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----', text), name
    return inventory, actual


def verify_attachments():
    count = 0
    for path in HERE.rglob('manifest.json'):
        for test in json.loads(path.read_text()):
            for attachment in test['attachments']:
                assert (path.parent / attachment['exportedFileName']).is_file(), path
                count += 1
    return count


def verify_sources(working_tree, source_ref):
    source = json.loads((HERE / 'after/source-input-hashes.json').read_text())
    sdk = json.loads((HERE / 'after/sdk-source-input-hashes.json').read_text())
    assert source == sdk, 'Both rebuilt targets use the same source snapshot'
    if working_tree:
        for key, expected in source.items():
            assert digest(ROOT / 'apps/ios' / key) == expected, key
    else:
        source_ref = subprocess.check_output(
            ['git', 'rev-parse', '--verify', source_ref + '^{commit}'], cwd=ROOT, text=True
        ).strip()
        archived = subprocess.check_output(['git', 'archive', source_ref, 'apps/ios'], cwd=ROOT)
        with tarfile.open(fileobj=io.BytesIO(archived)) as archive:
            for key, expected in source.items():
                member = archive.extractfile('apps/ios/' + key)
                assert member is not None, key
                assert hashlib.sha256(member.read()).hexdigest() == expected, key
    return len(source)


def verify_review(inventory, actual):
    review = json.loads((HERE / 'reviewed-screenshots.json').read_text())
    assert set(review) == {name for name in actual if name.endswith('.png')}
    assert all(row['sha256'] == inventory[name] and row['safeFictionalScope'] for name, row in review.items())
    return len(review)


def verify():
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--working-tree', action='store_true')
    mode.add_argument('--source-ref', default='db6023fe17893ec7c75b1a0815160ccbf4c7ff9f')
    args = parser.parse_args()
    inventory, actual = verify_files()
    references = verify_attachments()
    inputs = verify_sources(args.working_tree, args.source_ref)
    reviewed = verify_review(inventory, actual)
    print(json.dumps({'files': len(actual) + 1, 'attachmentReferences': references, 'nativeInputs': inputs, 'PNGReviewed': reviewed, 'workingTreeChecked': args.working_tree, 'passed': True}))


if __name__ == '__main__':
    verify()
