#!/usr/bin/env python3
"""Verify bounded native GET-only receipt isolation evidence."""
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
SOURCE_REF = 'f57094f3d3bee1d1aa945fe2fbb59398c42c19e4'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify_artifacts():
    inventory = json.loads((HERE / 'sha256.json').read_text())
    actual = {str(p.relative_to(HERE)) for p in HERE.rglob('*') if p.is_file() and p.name != 'sha256.json'}
    assert set(inventory) == actual
    tracked = set(subprocess.check_output(['git', 'ls-files', '--', str(HERE.relative_to(ROOT))], cwd=ROOT, text=True).splitlines())
    assert {str((HERE / p).relative_to(ROOT)) for p in actual | {'sha256.json'}} <= tracked
    for name, expected in inventory.items():
        path = HERE / name
        assert digest(path) == expected, name
        value = path.read_text()
        assert not re.search(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.', value), name
        assert not re.search(r'Bearer\s+[A-Za-z0-9_.-]+', value, re.I), name
        assert not re.search(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----', value), name
    for path in HERE.rglob('manifest.json'):
        for test in json.loads(path.read_text()):
            for attachment in test['attachments']:
                assert (path.parent / attachment['exportedFileName']).is_file()
    return len(actual) + 1


def verify_source(working_tree):
    source = json.loads((HERE / 'source-input-hashes.json').read_text())
    if working_tree:
        for key, expected in source.items():
            assert digest(ROOT / 'apps/ios' / key) == expected, key
    else:
        raw = subprocess.check_output(['git', 'archive', SOURCE_REF, 'apps/ios'], cwd=ROOT)
        with tarfile.open(fileobj=io.BytesIO(raw)) as archive:
            for key, expected in source.items():
                member = archive.extractfile('apps/ios/' + key)
                assert member is not None, key
                assert hashlib.sha256(member.read()).hexdigest() == expected, key
    return len(source)


def verify_results():
    fixture = json.loads((HERE / 'fixture-inputs.json').read_text())['existingRequests']
    alex = json.loads((HERE / 'alex/native-read.json').read_text())
    sam = json.loads((HERE / 'sam/native-read.json').read_text())
    assert alex['context'] == sam['context']
    assert alex['context']['grocery'] == fixture[0]['baseline']['grocery']
    assert alex['context']['reminder'] == fixture[1]['result']['receipt']['reminder']
    assert alex['recoveries'] == [v['result'] for v in fixture]
    for result, request in zip(sam['recoveries'], fixture, strict=True):
        assert result['status'] == 'unresolved' and result.get('receipt') is None
        assert result['actorId'].lower() == sam['actor']
        assert result['householdId'].lower() == sam['household']
        assert result['operationId'].lower() == request['command']['operationId'].lower()
    rows = json.loads((HERE / 'results.json').read_text())
    assert len(rows) == 2
    assert all(r['passed'] == 1 and r['failed'] == r['skipped'] == 0 for r in rows)
    restoration = json.loads((HERE / 'restoration.json').read_text())
    assert restoration['before'] == restoration['after']
    assert restoration['UIAutomationPerformed'] is False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--working-tree', action='store_true')
    args = parser.parse_args()
    files = verify_artifacts()
    inputs = verify_source(args.working_tree)
    verify_results()
    print(json.dumps({'passed': True, 'files': files, 'nativeInputs': inputs, 'nativeMethods': 2, 'screenshots': 0, 'workingTreeChecked': args.working_tree}))


if __name__ == '__main__':
    main()
