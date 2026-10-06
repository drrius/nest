#!/usr/bin/env python3
"""Verify immutable composite native inputs and bounded reminder evidence."""
import hashlib
import io
import json
import re
import subprocess
import tarfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
BASE = '13e4fb9a96ba53455a72640702cb71212bb9fca0'
OVERRIDE = '94ea7aef310b03215c3b6a82b68ac59ac878eadb'
UI_PATH = 'UITests/NativeChoreReminderNavigationTests.swift'
SDK_PATH = 'AppTests/HostedChoreReminderNavigationReadTests.swift'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def artifacts():
    inventory = json.loads((HERE / 'sha256.json').read_text())
    actual = {str(p.relative_to(HERE)) for p in HERE.rglob('*') if p.is_file() and p.name != 'sha256.json'}
    assert set(inventory) == actual
    tracked = set(subprocess.check_output(['git', 'ls-files', '--', str(HERE.relative_to(ROOT))], cwd=ROOT, text=True).splitlines())
    assert {str((HERE / p).relative_to(ROOT)) for p in actual | {'sha256.json'}} <= tracked
    for name, expected in inventory.items():
        path = HERE / name
        data = path.read_bytes()
        assert sha(data) == expected, name
        if path.suffix != '.png':
            text = data.decode()
            assert not re.search(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.', text), name
            assert not re.search(r'Bearer\s+[A-Za-z0-9_.-]+', text, re.I), name
            assert not re.search(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----', text), name
    for manifest in HERE.rglob('manifest.json'):
        for test in json.loads(manifest.read_text()):
            for attachment in test['attachments']:
                assert (manifest.parent / attachment['exportedFileName']).is_file()
    return len(actual) + 1


def sources():
    raw = subprocess.check_output(['git', 'archive', BASE, 'apps/ios'], cwd=ROOT)
    with tarfile.open(fileobj=io.BytesIO(raw)) as archive:
        base = {p.name.removeprefix('apps/ios/'): archive.extractfile(p).read() for p in archive if p.isfile()}
    ui = subprocess.check_output(['git', 'show', OVERRIDE + ':apps/ios/' + UI_PATH], cwd=ROOT)
    initial = (HERE / 'executed-source/initial-sdk.swift.txt').read_bytes()
    for path in HERE.rglob('*source-input-hashes.json'):
        data = dict(base)
        if path.parts[-2] == 'epoch-observer-failure':
            data[SDK_PATH] = initial
        if path.parts[-2] == 'maximum-suffix' and path.name == 'source-input-hashes.json':
            data[UI_PATH] = ui
        inventory = json.loads(path.read_text())
        for name, expected in inventory.items():
            assert sha(data[name]) == expected, (str(path), name)
    return {'base': BASE, 'UIOverride': OVERRIDE, 'baseInputs': 1098, 'SDKInputs': 1097}


def results():
    rows = []
    for folder in ['epoch-observer-failure', 'before', 'normal-pass-maximum-stepper-failure', 'maximum-suffix']:
        rows += json.loads((HERE / folder / 'results.json').read_text())
        restored = json.loads((HERE / folder / 'restoration.json').read_text())
        assert restored['before'] == restored['after'] and restored['hostedMutations'] == 0
    assert sum(r['passed'] for r in rows) == 6
    assert sum(r['failed'] for r in rows) == 2 and sum(r['skipped'] for r in rows) == 0
    before = json.loads((HERE / 'before/alex/native-read.json').read_text())['context']
    for path in ['before/sam', 'maximum-suffix/alex-after', 'maximum-suffix/sam-after']:
        assert json.loads((HERE / path / 'native-read.json').read_text())['context'] == before
    assert before.get('reminder') is None
    assert before['chore']['occurrenceId'].lower() == 'ce88cf42-4359-41d4-ab06-a7185c22306b'
    assert before['chore']['title'] == 'Hosted smoke tidy kitchen'


if __name__ == '__main__':
    count = artifacts()
    pins = sources()
    results()
    print(json.dumps({'passed': True, 'evidenceFiles': count, 'pins': pins, 'nativePasses': 6, 'retainedFailures': 2}))
