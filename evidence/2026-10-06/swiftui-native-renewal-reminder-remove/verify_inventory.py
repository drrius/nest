#!/usr/bin/env python3
"""Check immutable native removal evidence; never run API or UI actions."""
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
SOURCE = '114404f5c7e3a77b33e19b6cd1ecc13bfe4007f1'


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
        source(expected['preparedSourceCommit'], path / 'source-input-hashes.json', 1115)
        assert digest((path / 'executed-controller.py').read_bytes()) == expected['controllerSha256']
        rows = read(path / 'results.json') if (path / 'results.json').exists() else []
        assert len(rows) == expected['methods']
        assert sum(row['passed'] for row in rows) == expected['passed']
        assert sum(row['failed'] for row in rows) == expected['failed']
        assert all(row['skipped'] == 0 for row in rows)
        passed += expected['passed']
        failed += expected['failed']
    assert (passed, failed) == (20, 3)
    assert not outcome['batches']['stale-incremental-runtime']['freshCompiledRuntimeAttested']
    assert outcome['staleRuntimeScope']['exactBinarySourceNotAttested']


def verify_artifact_attestations():
    path = HERE / 'alert-removal-recorded'
    for name, needle in [('Nest', 'HostedActiveRenewalReminderRemovalReadTests.swift'), ('NestAccessibility', 'NativeActiveRenewalReminderRemoveTests.swift')]:
        value = read(path / (name + '-build-attestation.json'))
        assert value['freshDirectoryRequired'] and needle in str(value['ownedSourceCompileLines'])
        assert len(value['binarySha256']) >= 3
        assert all(re.fullmatch('[0-9a-f]{64}', item) for item in value['binarySha256'].values())
        suite = 'NestAppTests' if name == 'Nest' else 'NestAccessibilityTests'
        products = value['resolvedProductPaths'][suite]
        assert all('reminder-alert-' in item and '/Build/Products/' in item for item in products.values())
        assert read(HERE / 'removal-done' / (name + '-build-attestation.json')) == value


def verify_records():
    path = HERE / 'alert-removal-recorded'
    removal = read(path / 'owned-removal-request.json')
    saved = read(path / 'expected-reminder-request.json')
    command = removal['command']
    assert command['operationId'].lower() == 'be001379-8c88-479b-b551-066629e91725'
    assert command['renewalId'].lower() == '23435fe5-5b08-48cd-b0fb-03f0e2d49690'
    assert command['expectedRevision'].lower() == '6610131c-d4d9-42fc-89f2-42ffe0a7b777'
    assert command.get('fields') is None and not removal['cancellationRequested']
    assert removal['result']['status'] == 'recorded'
    removed = removal['result']['receipt']['renewal']
    assert removed['removed'] and removed['fields'] == saved['renewal']['fields']
    assert removed['revision'] != saved['renewal']['revision']
    baseline = read(path / 'phase1-canonical-baseline.json')
    assert baseline['historyPages'][-1].get('next') is None
    assert sum(len(page['events']) for page in baseline['historyPages']) == 62
    assert sorted(member['centimes'] for member in baseline['balance']['members']) == ['-1', '1']
    for folder, step in [('alert-removal-recorded', 'recorded'), ('removal-done', 'final')]:
        alex = read(HERE / folder / ('alex-' + step) / 'native-read.json')
        sam = read(HERE / folder / ('sam-' + step) / 'native-read.json')
        assert alex['canonical'] == sam['canonical'] == baseline
        assert alex['renewal'] == sam['renewal'] == removed
        assert all(not page['renewals'] for page in alex['renewalPages'])
        assert alex['renewalPages'][-1].get('next') is None
        assert alex['reminder'] == sam['reminder']
        assert alex['reminder']['reminder'] == saved['result']['receipt']['reminder']
        assert alex['operationRecovery'] == saved['result'] and alex['removalRecovery'] == removal['result']
        assert sam['operationRecovery']['status'] == sam['removalRecovery']['status'] == 'unresolved'
        assert sam['operationRecovery'].get('receipt') is None and sam['removalRecovery'].get('receipt') is None
        assert alex['hostedCommands'] == sam['hostedCommands'] == 0


def verify_restore():
    value = read(HERE / 'removal-done/terminal.json')
    assert value['restartDoneMethodPassed'] and value['bothFinalCanonicalReadsPassed']
    assert value['recordedRequestCleared'] and value['ReminderEnabledHistoryRetained']
    assert value['POSTs'] == value['RemoveReplays'] == value['ReminderSaveReplays'] == value['CreateReplays'] == 0
    restored = read(HERE / 'removal-done/restoration.json')
    assert restored['all64JournalsEmpty'] and restored['originalScopesUnchanged']
    assert restored['largeLight'] and restored['foregroundLaunchAfterSDK'] and restored['TodayReturnedInTest']
    assert restored['selectedPlansRemoved'] and restored['scopedCaffeinateStopped']
    assert restored['after']['alex']['emptyJournals'] == restored['after']['sam']['emptyJournals'] == 64
    assert read(HERE / 'alert-removal-recorded/cold-termination.json')['status'] == 3
    assert 'found nothing to terminate' in read(HERE / 'alert-removal-recorded/cold-termination.json')['diagnostic']


if __name__ == '__main__':
    count = verify_artifacts()
    outcome = read(HERE / 'outcome.json')
    verify_visual(outcome)
    verify_batches(outcome)
    verify_artifact_attestations()
    verify_records()
    verify_restore()
    print(json.dumps({'passed': True, 'files': count, 'NativeInputs': 1115, 'nativeMethodsPassed': 20,
                      'retainedNativeFailures': 3, 'controllerGuardFailures': 3, 'reviewedPNGs': 26,
                      'RemovePOSTs': 1, 'RemoveReplays': 0}))
