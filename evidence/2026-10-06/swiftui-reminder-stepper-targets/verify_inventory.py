#!/usr/bin/env python3
"""Verify immutable native Stepper probe input and artifact inventories."""
import hashlib
import io
import json
import re
import subprocess
import tarfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SOURCES = {
    'before': ('beaf65e848e88125a83059ebdf633b1ff2ee5f72', 1099),
    'control-size-large': ('3696248cd341beed0d29425bd51e83c939769d1c', 1099),
    'native-buttons': ('d088e76a278f7fe0b242e6f131a00a3f5cf30830', 1100),
    'icon-polish': ('74d37d1a9ecd350f65a8ef9d56ae5402ef92498e', 1100),
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def verify_artifacts():
    expected = json.loads((HERE / 'sha256.json').read_text())
    actual = {str(p.relative_to(HERE)) for p in HERE.rglob('*') if p.is_file() and p.name != 'sha256.json'}
    assert actual == set(expected)
    tracked = set(subprocess.check_output(['git', 'ls-files', '--', str(HERE.relative_to(ROOT))], cwd=ROOT, text=True).splitlines())
    assert {str((HERE / p).relative_to(ROOT)) for p in actual | {'sha256.json'}} <= tracked
    for name, value in expected.items():
        path = HERE / name
        data = path.read_bytes()
        assert digest(data) == value, name
        if path.suffix != '.png':
            text = data.decode()
            assert not re.search(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.', text), name
            assert not re.search(r'Bearer\s+[A-Za-z0-9_.-]+', text, re.I), name
            assert not re.search(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----', text), name
    for path in HERE.rglob('manifest.json'):
        for test in json.loads(path.read_text()):
            for attachment in test['attachments']:
                assert (path.parent / attachment['exportedFileName']).is_file()
    return len(actual) + 1


def verify_sources():
    for folder, (pin, count) in SOURCES.items():
        raw = subprocess.check_output(['git', 'archive', pin, 'apps/ios'], cwd=ROOT)
        inputs = json.loads((HERE / folder / 'source-input-hashes.json').read_text())
        with tarfile.open(fileobj=io.BytesIO(raw)) as archive:
            for key, value in inputs.items():
                assert digest(archive.extractfile('apps/ios/' + key).read()) == value, (folder, key)
        assert len(inputs) == count
    return SOURCES


def verify_icon_only_difference():
    prior = json.loads((HERE / 'native-buttons/source-input-hashes.json').read_text())
    final = json.loads((HERE / 'icon-polish/source-input-hashes.json').read_text())
    assert prior.keys() == final.keys()
    changed = [key for key in prior if prior[key] != final[key]]
    assert changed == ['Nest/Reminders/ReminderLeadTimeControl.swift']
    path = 'apps/ios/Nest/Reminders/ReminderLeadTimeControl.swift'
    old = subprocess.check_output(['git', 'show', SOURCES['native-buttons'][0] + ':' + path], cwd=ROOT)
    new = subprocess.check_output(['git', 'show', SOURCES['icon-polish'][0] + ':' + path], cwd=ROOT)
    assert new.replace(b'                .font(.system(size: 18, weight: .semibold))\n', b'') == old


def verify_profile(folder, profile):
    records = [json.loads(p.read_text()) for p in (HERE / folder / profile).glob('*.json')]
    changes = [v for v in records if isinstance(v, dict) and 'actualValue' in v]
    points = [v for v in records if isinstance(v, dict) and 'offsetFromCenterY' in v]
    assert len(changes) == len(points) == 4
    assert all(v['changed'] for v in changes)
    assert sorted(v['expected'] for v in points) == [0, 1, 1, 2]
    assert sorted(v['offsetFromCenterY'] for v in points) == [-21, -21, 21, 21]


def verify_readback(folder, baseline):
    before = json.loads((HERE / folder / 'alex-before/native-read.json').read_text())['context']
    after = json.loads((HERE / folder / 'alex-after/native-read.json').read_text())['context']
    baseline = baseline or before
    assert before == after == baseline
    assert before.get('reminder') is None
    restored = json.loads((HERE / folder / 'restoration.json').read_text())
    assert restored['before'] == restored['after']
    assert restored['hostedMutations'] == 0
    return baseline


def verify_results():
    rows = []
    baseline = None
    for folder in SOURCES:
        rows += json.loads((HERE / folder / 'results.json').read_text())
        baseline = verify_readback(folder, baseline)
    outcome = json.loads((HERE / 'outcome.json').read_text())
    assert sum(r['passed'] for r in rows) == outcome['nativePasses'] == 11
    assert sum(r['failed'] for r in rows) == outcome['nativeFailures'] == 2
    assert baseline['chore']['occurrenceId'].lower() == 'ce88cf42-4359-41d4-ab06-a7185c22306b'
    final = json.loads((HERE / 'native-buttons/results.json').read_text())
    assert len(final) == 4
    assert all(r['passed'] == 1 and r['failed'] == r['skipped'] == 0 for r in final)
    verify_profile('native-buttons', 'normal_light')
    verify_profile('native-buttons', 'maximum_dark')
    verify_profile('icon-polish', 'maximum_dark')


if __name__ == '__main__':
    files = verify_artifacts()
    inputs = verify_sources()
    verify_results()
    verify_icon_only_difference()
    print(json.dumps({'passed': True, 'files': files, 'nativeInputs': inputs, 'sourcePins': inputs}))
