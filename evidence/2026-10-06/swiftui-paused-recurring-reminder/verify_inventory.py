#!/usr/bin/env python3
"""Verify immutable paused reminder UI evidence and complete native read preservation."""
import csv
import hashlib
import io
import json
import re
import subprocess
import tarfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
UI_SOURCE = 'e3b5b5929f86118be8f7aac13bafd0dca6026d17'
SDK_SOURCE = '1e8a5869d818dd1824d6c7c8bc01a2b998a026b9'
MAX_SOURCE = 'dacea8fa1e83a7887ff1d4282a927cad4d551d85'
FIXED_SOURCE = 'f7094205df23cb2d1908fd5e36e69326837e1cc6'


def read(path):
    return json.loads(path.read_text())


def digest(data):
    return hashlib.sha256(data).hexdigest()


def verify_artifacts():
    expected = read(HERE / 'sha256.json')
    actual = {str(p.relative_to(HERE)) for p in HERE.rglob('*') if p.is_file() and p.name != 'sha256.json'}
    assert actual == set(expected)
    tracked = set(subprocess.check_output(['git', 'ls-files'], cwd=ROOT, text=True).splitlines())
    assert {str((HERE / p).relative_to(ROOT)) for p in actual | {'sha256.json'}} <= tracked
    for name, value in expected.items():
        data = (HERE / name).read_bytes()
        assert digest(data) == value, name
        if name.endswith('.png'):
            continue
        text = data.decode()
        assert not re.search(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.', text), name
        assert not re.search(r'Bearer\s+[A-Za-z0-9_.-]+', text, re.I), name
        assert not re.search(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----', text), name
    for path in HERE.rglob('manifest.json'):
        for test in read(path):
            for attachment in test['attachments']:
                assert (path.parent / attachment['exportedFileName']).is_file()
    outcome = read(HERE / 'outcome.json')
    assert digest((HERE / 'controller.py').read_bytes()) == outcome['initialControllerSha256']
    assert digest((HERE / 'maximum-controller.py').read_bytes()) == outcome['maximumControllerSha256']
    assert digest((HERE / 'fixed-maximum-controller.py').read_bytes()) == outcome['fixedMaximumControllerSha256']
    assert len(list(HERE.rglob('*.png'))) == outcome['reviewedPNGs']
    return len(actual) + 1


def verify_source(commit, filename, count):
    raw = subprocess.check_output(['git', 'archive', commit, 'apps/ios'], cwd=ROOT)
    inputs = read(HERE / filename)
    assert len(inputs) == count
    with tarfile.open(fileobj=io.BytesIO(raw)) as archive:
        for key, value in inputs.items():
            assert digest(archive.extractfile('apps/ios/' + key).read()) == value, key
    return inputs


def normalized(value):
    result = dict(value)
    for key in ['eventId', 'createdBy', 'payerId', 'relatedEventId']:
        if isinstance(result.get(key), str):
            result[key] = result[key].lower()
    for key in ['payerId', 'relatedEventId']:
        result.setdefault(key, None)
    return result


def verify_local_delta(canonical):
    provenance = read(HERE / 'local-history-provenance.json')
    originals = {}
    for path, value in provenance['sources'].items():
        raw = subprocess.check_output(['git', 'show', provenance['sourceCommit'] + ':' + path], cwd=ROOT)
        assert digest(raw) == value
        originals[path] = raw
    previous = originals['evidence/2026-10-05/swiftui-private-variable-bill/final-history.csv']
    old = {row['eventId']: normalized(json.loads(row['completeSummaryJSON'])) for row in csv.DictReader(io.StringIO(previous.decode()))}
    current = {event['eventId'].lower(): normalized(event) for page in canonical['historyPages'] for event in page['events']}
    assert len(old) == 61 and len(current) == 62
    assert all(current[key] == event for key, event in old.items())
    assert set(current) - set(old) == {provenance['knownExpenseEventId']}
    assert current[provenance['knownExpenseEventId']]['description'] == provenance['knownExpenseTitle']
    assert read(HERE / 'local-history-delta.json')['original61SemanticallyExact']


def verify_batch(folder, baseline):
    location = HERE / folder
    rows = read(location / 'results.json')
    expected = read(HERE / 'outcome.json')['batches'][folder]
    assert len(rows) == expected['methods']
    assert sum(row['passed'] for row in rows) == expected['passed']
    assert sum(row['failed'] for row in rows) == expected['failed']
    assert all(row['skipped'] == 0 for row in rows)
    records = [read(location / key / 'native-read.json') for key in ['alex-before', 'sam-before', 'alex-after', 'sam-after']]
    canonical = records[0]['canonical']
    assert canonical == baseline
    assert all(record['canonical'] == canonical and record['historyComplete'] and record['historyEventCount'] == 62 for record in records)
    restored = read(location / 'restoration.json')
    assert restored['before'] == restored['after'] and restored['hostedMutations'] == 0
    return rows


def verify_fixed(canonical):
    fixed = verify_batch('fixed-maximum', canonical)
    assert all(row['passed'] == 1 and row['failed'] == row['exitCode'] == 0 for row in fixed)
    assert read(HERE / 'fixed-maximum/terminal.json')['maximumProfilePassed']
    pinned = read(HERE / 'fixed-maximum/source-pinning.json')
    assert pinned['ExecutedSourceCommit'] == FIXED_SOURCE and pinned['SDKAndUIRebuilt']


def verify_results():
    canonical = read(HERE / 'initial/alex-before/native-read.json')['canonical']
    initial = verify_batch('initial', canonical)
    failed = [row for row in initial if row['failed']]
    assert len(failed) == 1 and failed[0]['step'] == 'maximum_dark' and failed[0]['exitCode'] == 65
    assert not read(HERE / 'initial/terminal.json')['bothUIProfilesPassed']
    maximum = verify_batch('maximum-recovery', canonical)
    assert not read(HERE / 'maximum-recovery/terminal.json')['maximumProfilePassed']
    failed_maximum = [row for row in maximum if row['failed']]
    assert len(failed_maximum) == 1 and failed_maximum[0]['step'] == 'maximum_dark'
    geometry = read(HERE / 'maximum-geometry.json')
    assert geometry['targetHeightPoints'] == 599 and geometry['usableHeightPoints'] == 502
    assert not geometry['reminderEditorEntered'] and not geometry['tapPerformedOnTarget']
    assert canonical['context']['rule']['status'] == 'paused' and canonical['context'].get('reminder') is None
    assert canonical['historyPages'][-1].get('next') is None
    assert sorted(member['centimes'] for member in canonical['balance']['members']) == ['-1', '1']
    verify_local_delta(canonical)
    verify_fixed(canonical)


if __name__ == '__main__':
    files = verify_artifacts()
    initial = verify_source(UI_SOURCE, 'initial/source-input-hashes.json', 1108)
    maximum = verify_source(MAX_SOURCE, 'maximum-recovery/source-input-hashes.json', 1108)
    sdk = verify_source(SDK_SOURCE, 'initial/sdk-source-input-hashes.json', 1107)
    assert sdk == read(HERE / 'maximum-recovery/sdk-source-input-hashes.json')
    assert {key: value for key, value in initial.items() if key != 'UITests/NativePausedRecurringReminderTests.swift'} == sdk
    assert {key: value for key, value in maximum.items() if key != 'UITests/NativePausedRecurringReminderTests.swift'} == sdk
    fixed = verify_source(FIXED_SOURCE, 'fixed-maximum/source-input-hashes.json', 1108)
    assert {key for key in fixed if fixed[key] != maximum[key]} == {'Nest/Money/RecurringRulesScreen.swift', 'UITests/NativePausedRecurringReminderTests.swift'}
    verify_results()
    print(json.dumps({'passed': True, 'files': files, 'UIInputsPerVariant': 1108, 'SDKInputs': len(sdk), 'nativeMethodsPassed': 14, 'retainedFailures': 2}))
