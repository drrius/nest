#!/usr/bin/env python3
"""Check immutable native unsent-draft evidence; never run API or UI actions."""
import argparse
import hashlib
import io
import json
import re
import subprocess
import tarfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SOURCE = '848fcd7cbfc217bb05d566cec2beb0b5f24477f5'


def read(path):
    return json.loads(path.read_text())


def digest(data):
    return hashlib.sha256(data).hexdigest()


def verify_payload(path, value):
    data = path.read_bytes()
    assert digest(data) == value, path
    if path.suffix == '.png':
        return
    text = data.decode()
    assert not re.search(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.', text), path
    assert not re.search(r'Bearer\s+[A-Za-z0-9_.-]+', text, re.I), path
    assert not re.search(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----', text), path


def verify_artifacts():
    expected = read(HERE / 'sha256.json')
    actual = {str(p.relative_to(HERE)) for p in HERE.rglob('*') if p.is_file() and p.name != 'sha256.json'}
    assert actual == set(expected)
    tracked = set(subprocess.check_output(['git', 'ls-files'], cwd=ROOT, text=True).splitlines())
    assert {str((HERE / p).relative_to(ROOT)) for p in actual | {'sha256.json'}} <= tracked
    for name, value in expected.items():
        verify_payload(HERE / name, value)
    for manifest in HERE.rglob('manifest.json'):
        for test in read(manifest):
            for item in test['attachments']:
                assert (manifest.parent / item['exportedFileName']).is_file()
    return len(actual) + 1


def verify_visual(outcome):
    review = read(HERE / 'visual-review.json')
    pngs = {str(p.relative_to(HERE)) for p in HERE.rglob('*.png')}
    assert pngs == set(review) and len(pngs) == outcome['reviewedPNGs']
    for name, value in review.items():
        assert value['reviewed'] and value['safeFictionalScope']
        assert value['sha256'] == digest((HERE / name).read_bytes())


def source(commit, filename, count):
    values = read(filename)
    assert len(values) == count
    raw = subprocess.check_output(['git', 'archive', commit, 'apps/ios'], cwd=ROOT)
    with tarfile.open(fileobj=io.BytesIO(raw)) as archive:
        for key, value in values.items():
            assert digest(archive.extractfile('apps/ios/' + key).read()) == value, key
    return values


def verify_batches(outcome):
    passed = failed = 0
    for folder, expected in outcome['batches'].items():
        path = HERE / folder
        source(SOURCE, path / 'source-input-hashes.json', 1113)
        assert digest((path / 'executed-controller.py').read_bytes()) == expected['controllerSha256']
        rows = read(path / 'results.json') if (path / 'results.json').exists() else []
        assert len(rows) == expected['methods']
        assert sum(row['passed'] for row in rows) == expected['passed']
        assert sum(row['failed'] for row in rows) == expected['failed']
        assert all(row['skipped'] == 0 for row in rows)
        passed += expected['passed']
        failed += expected['failed']
    assert (passed, failed) == (7, 1)


def verify_records():
    saved = read(HERE / 'save-observer-failure/owned-reminder-request.json')
    command = saved['command']
    assert command['operationId'].lower() == '32102900-3d5a-4aa6-9d41-647dab7cf63c'
    assert command['renewalId'].lower() == '23435fe5-5b08-48cd-b0fb-03f0e2d49690'
    assert command['expectedRenewalRevision'].lower() == '6610131c-d4d9-42fc-89f2-42ffe0a7b777'
    assert command.get('expectedRevision') is None and saved['baseline'].get('reminder') is None
    assert saved['result']['status'] == 'recorded' and not saved['cancellationRequested']
    reminder = saved['result']['receipt']['reminder']
    assert reminder['revision'].lower() == '30203c42-0138-4472-a03a-374b99bbb9d6'
    settings = command['settings']
    assert settings['anchor'] == 'renewal'
    assert settings['delivery']['enabled'] and settings['delivery']['daysBefore'] == 1
    assert settings['delivery']['localTime'] == '09:00'
    assert reminder['settings'] == settings
    baseline = read(HERE / 'save-observer-failure/phase1-canonical-baseline.json')
    assert baseline['historyPages'][-1].get('next') is None
    assert sum(len(page['events']) for page in baseline['historyPages']) == 62
    assert sorted(member['centimes'] for member in baseline['balance']['members']) == ['-1', '1']
    for folder, step in [('recorded-private-isolation', 'recorded'), ('cold-restart-done', 'final')]:
        alex = read(HERE / folder / ('alex-' + step) / 'native-read.json')
        sam = read(HERE / folder / ('sam-' + step) / 'native-read.json')
        assert alex['canonical'] == sam['canonical'] == baseline
        assert alex['renewal'] == sam['renewal'] == saved['renewal']
        assert alex['reminder'] == sam['reminder'] and alex['reminder']['reminder'] == reminder
        assert alex['operationRecovery'] == saved['result']
        assert sam['operationRecovery']['status'] == 'unresolved'
        assert sam['operationRecovery'].get('receipt') is None
        assert alex['hostedCommands'] == sam['hostedCommands'] == 0


def verify_restore():
    result = read(HERE / 'cold-restart-done/terminal.json')
    assert result['restartDoneMethodPassed'] and result['bothFinalCanonicalReadsPassed']
    assert result['recordedRequestCleared'] and result['ReminderEnabledRetained']
    assert result['POSTs'] == result['SaveReplays'] == result['Removes'] == 0
    restored = read(HERE / 'cold-restart-done/restoration.json')
    assert restored['all64JournalsEmpty'] and restored['originalScopesUnchanged']
    assert restored['largeLight'] and restored['foregroundLaunchAfterSDK'] and restored['TodayReturnedInTest']
    assert restored['selectedPlansRemoved'] and restored['scopedCaffeinateStopped']
    assert restored['after']['alex']['emptyJournals'] == restored['after']['sam']['emptyJournals'] == 64
    first = read(HERE / 'save-observer-failure/restoration.json')
    assert first['after']['alex']['emptyJournals'] == 63 and first['ownedRequestRetained']
    failed = read(HERE / 'save-observer-failure/results.json')[-1]
    assert failed['failed'] == 1 and failed['seconds'] == 147.526
    preparation = HERE / 'cold-stop-preparation-failure/results.json'
    assert not preparation.exists()


if __name__ == '__main__':
    count = verify_artifacts()
    outcome = read(HERE / 'outcome.json')
    verify_visual(outcome)
    verify_batches(outcome)
    verify_records()
    verify_restore()
    print(json.dumps({'passed': True, 'files': count, 'NativeInputs': 1113, 'nativeMethodsPassed': 7,
                      'retainedNativeFailures': 1, 'separatePreparationFailures': 1, 'reviewedPNGs': 19,
                      'ReminderSavePOSTs': 1, 'SaveReplays': 0}))
