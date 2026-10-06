#!/usr/bin/env python3
"""Verify the immutable native GET-only reminder eligibility checkpoint."""
import hashlib
import io
import json
import re
import subprocess
import tarfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SOURCE = 'a7ac3ad7e33b4eedaa23e8c4c41362896d0c9683'


def read(path):
    return json.loads(path.read_text())


def digest(data):
    return hashlib.sha256(data).hexdigest()


def verify_artifacts():
    expected = read(HERE / 'sha256.json')
    actual = {str(p.relative_to(HERE)) for p in HERE.rglob('*') if p.is_file() and p.name != 'sha256.json'}
    assert actual == set(expected)
    tracked = set(subprocess.check_output(['git', 'ls-files', '--', str(HERE.relative_to(ROOT))], cwd=ROOT, text=True).splitlines())
    assert {str((HERE / p).relative_to(ROOT)) for p in actual | {'sha256.json'}} <= tracked
    for name, value in expected.items():
        data = (HERE / name).read_bytes()
        assert digest(data) == value, name
        text = data.decode()
        assert not re.search(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.', text), name
        assert not re.search(r'Bearer\s+[A-Za-z0-9_.-]+', text, re.I), name
        assert not re.search(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----', text), name
    for path in HERE.rglob('manifest.json'):
        for test in read(path):
            for attachment in test['attachments']:
                assert (path.parent / attachment['exportedFileName']).is_file()
    assert not list(HERE.rglob('*.png'))
    assert digest((HERE / 'controller.py').read_bytes()) == read(HERE / 'outcome.json')['executedControllerSha256']
    return len(actual) + 1


def verify_sources():
    raw = subprocess.check_output(['git', 'archive', SOURCE, 'apps/ios'], cwd=ROOT)
    inputs = read(HERE / 'source-input-hashes.json')
    assert len(inputs) == 1105
    with tarfile.open(fileobj=io.BytesIO(raw)) as archive:
        for key, value in inputs.items():
            assert digest(archive.extractfile('apps/ios/' + key).read()) == value, key
    return len(inputs)


def verify_records():
    a = read(HERE / 'alex/native-read.json')
    b = read(HERE / 'sam/native-read.json')
    for key in ['roster', 'recurringPages', 'renewalPages', 'eligibleRecurringIds', 'eligibleRenewalIds', 'recurringTarget', 'renewalTarget']:
        assert a[key] == b[key], key
    assert a['household'] == b['household'] == 'be772ffd-3ab5-41d5-8438-647a79a553da'
    assert a['actor'] == '791f7261-6c9d-4061-9c8a-57aa6e0b0200'
    assert b['actor'] == 'e5f80cfd-b69a-4aa0-a267-75784e943676'
    assert a['eligibleRecurringIds'] == a['eligibleRenewalIds'] == []
    assert a['recurringTarget'] is None and a['renewalTarget'] is None
    rules = [r for page in a['recurringPages'] for r in page['rules']]
    assert len(rules) == 7
    assert sum(r['status'] == 'paused' for r in rules) == 4
    assert sum(r['status'] == 'cancelled' for r in rules) == 3
    assert a['recurringPages'][-1].get('next') is None
    assert a['renewalPages'][-1].get('next') is None
    assert not [r for page in a['renewalPages'] for r in page['renewals']]


def verify_results():
    rows = read(HERE / 'results.json')
    assert len(rows) == 2
    assert all(r['passed'] == 1 and r['failed'] == r['skipped'] == r['exitCode'] == 0 for r in rows)
    restored = read(HERE / 'restoration.json')
    assert restored['before'] == restored['after']
    assert restored['hostedMutations'] == 0 and not restored['UIAutomationPerformed']
    assert read(HERE / 'terminal.json')['completedBothMethods']
    verify_records()


if __name__ == '__main__':
    files = verify_artifacts()
    inputs = verify_sources()
    verify_results()
    print(json.dumps({'passed': True, 'files': files, 'nativeInputs': inputs, 'nativeMethodsPassed': 2, 'eligibleTargets': 0, 'source': SOURCE}))
