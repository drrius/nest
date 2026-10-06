#!/usr/bin/env python3
"""Check bounded real native reminder Save evidence and receipt bindings."""
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
    source = json.loads((HERE / 'source-input-hashes.json').read_text())
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


def verify_receipts():
    enabled = json.loads((HERE / 'enabled-saved-request.json').read_text())
    disabled = json.loads((HERE / 'disabled-saved-request.json').read_text())
    first = enabled['result']['receipt']
    last = disabled['result']['receipt']
    assert first['operationId'] != last['operationId']
    assert first['reminder']['revision'] != last['reminder']['revision']
    assert disabled['command']['expectedRevision'] == first['reminder']['revision']
    assert enabled['command']['settings']['enabled'] is True
    assert disabled['command']['settings']['enabled'] is False
    before = json.loads((HERE / 'alex-before/native-read.json').read_text())
    alex = json.loads((HERE / 'alex-final/native-read.json').read_text())
    sam = json.loads((HERE / 'sam-final/native-read.json').read_text())
    assert alex['context'] == sam['context']
    assert alex['context']['grocery'] == before['context']['grocery']
    assert alex['context']['reminder'] == last['reminder']
    assert [r['receipt'] for r in alex['ownerRecoveries']] == [first, last]
    budget = json.loads((HERE / 'command-budget.json').read_text())
    assert budget['recordedOperations'] == [first['operationId'], last['operationId']]
    assert budget['saveMethodInvocations'] == ['enabled', 'disabled']
    assert budget['automaticReplays'] == 0
    results = json.loads((HERE / 'results.json').read_text())
    assert len(results) == 12
    assert all(r['passed'] == 1 and r['failed'] == r['skipped'] == 0 for r in results)


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
