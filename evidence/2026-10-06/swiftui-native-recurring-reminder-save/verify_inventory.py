#!/usr/bin/env python3
"""Verify immutable native recurring item-reminder Save evidence; never invoke API/UI."""
import hashlib
import io
import json
import re
import subprocess
import tarfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
RUN = HERE / 'recorded-save'
SOURCE = '6997138485f3f8088fc03682432de74879e19659'
ALEX = '791f7261-6c9d-4061-9c8a-57aa6e0b0200'
SAM = 'e5f80cfd-b69a-4aa0-a267-75784e943676'
HH = 'be772ffd-3ab5-41d5-8438-647a79a553da'
OP = 'f23e5dfb-cc10-4199-a0f1-bc2cfcbd521c'
REV = 'f736854d-935a-4433-ba0c-13a4b5e51ac6'


def read(path):
    return json.loads(path.read_text())


def digest(data):
    return hashlib.sha256(data).hexdigest()


def verify_inventory():
    expected = read(HERE / 'sha256.json')
    files = {str(p.relative_to(HERE)) for p in HERE.rglob('*') if p.is_file() and p.name != 'sha256.json'}
    assert files == set(expected)
    tracked = set(subprocess.check_output(['git', 'ls-files'], cwd=ROOT, text=True).splitlines())
    assert {str((HERE / name).relative_to(ROOT)) for name in files | {'sha256.json'}} <= tracked
    for name, value in expected.items():
        path = HERE / name
        assert digest(path.read_bytes()) == value, name
        if path.suffix == '.png':
            continue
        text = path.read_text()
        assert not re.search(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.', text), name
        assert not re.search(r'Bearer\s+[A-Za-z0-9_.-]+', text, re.I), name
        assert not re.search(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----', text), name
    for manifest in HERE.rglob('manifest.json'):
        for test in read(manifest):
            for item in test['attachments']:
                assert (manifest.parent / item['exportedFileName']).is_file()
    return len(files) + 1


def verify_sources():
    values = read(RUN / 'source-input-hashes.json')
    assert len(values) == 1122
    raw = subprocess.check_output(['git', 'archive', SOURCE, 'apps/ios'], cwd=ROOT)
    with tarfile.open(fileobj=io.BytesIO(raw)) as archive:
        for key, value in values.items():
            assert digest(archive.extractfile('apps/ios/' + key).read()) == value, key
    names = {'Nest': 'HostedActiveRecurringReminderReceiptReadTests.swift',
             'NestAccessibility': 'NativeActiveRecurringReminderSaveTests.swift'}
    for scheme, filename in names.items():
        value = read(RUN / (scheme + '-build-attestation.json'))
        assert value['freshDirectoryRequired'] and filename in str(value['ownedSourceCompileLines'])
        assert len(value['binarySha256']) >= 3
        assert all(re.fullmatch('[0-9a-f]{64}', h) for h in value['binarySha256'].values())
        for paths in value['resolvedProductPaths'].values():
            assert str(paths).count(value['derivedData']) >= 2
    pin = read(RUN / 'source-pinning.json')
    assert pin['PreparedSourceCommit'] == SOURCE and pin['NativeInputs'] == 1122


def verify_methods(outcome):
    rows = read(RUN / 'results.json')
    assert len(rows) == 8 and all([r['exitCode'], r['passed'], r['failed'], r['skipped']] == [0, 1, 0, 0] for r in rows)
    assert rows[2]['step'] == 'native-save-once' and rows[2]['seconds'] == 88.193
    assert rows[5]['step'] == 'native-cold-recorded-done' and rows[5]['seconds'] == 66.557
    assert outcome['nativeMethodsPassed'] == 8 and outcome['nativeMethodsFailed'] == 0
    assert outcome['nativeSaveInvocations'] == outcome['immutableRecordedOperations'] == 1
    assert not outcome['wirePOSTCountMeasured']
    assert digest((HERE / 'executed-controller.py').read_bytes()) == outcome['controllerSha256']
    assert not read(HERE / 'initial-source-ci-failure.json')['nativeAPIOrUIExecuted']
    assert not read(HERE / 'corrected-source-prepare-failure.json')['APIOrUIExecuted']


def verify_request():
    saved = read(RUN / 'captured-reminder-request.json')
    command = saved['command']
    receipt = saved['result']['receipt']
    assert command['operationId'].lower() == OP and saved['result']['status'] == 'recorded'
    assert 'expectedRevision' in command and command['expectedRevision'] is None
    assert command['expectedRuleRevision'].lower() == '528417a1-b97a-4be4-9e63-ad7c8c03c2be'
    assert command['expectedDueOn'] == '2026-11-01' and not saved['cancellationRequested']
    settings = command['settings']
    assert settings['enabled'] and settings['localTime'] == '09:00' and settings['daysBefore'] == 1
    assert sorted(a.lower() for a in settings['recipientIds']) == sorted([ALEX, SAM])
    assert receipt['command'] == command and receipt['reminder']['settings'] == settings
    assert receipt['reminder']['revision'].lower() == REV
    for value in [saved['result'], receipt]:
        assert value['actorId'].lower() == ALEX and value['householdId'].lower() == HH
        assert value['operationId'].lower() == OP
    return saved


def verify_reads(saved):
    baseline = read(RUN / 'baseline.json')
    references = read(RUN / 'references.json')
    assert len(baseline['originalRules']) == 7
    assert sorted(r['status'] for r in baseline['originalRules']) == ['cancelled'] * 3 + ['paused'] * 4
    assert sum(len(p['rules']) for p in baseline['allRulePages']) == 8
    history = baseline['historyPages']
    assert history[-1].get('next') is None and sum(len(p['events']) for p in history) == 62
    assert baseline['knownRemovedRenewalHistory'] == references['knownRemovedHistory']
    rows = [read(p) for p in RUN.glob('*/native-read.json')]
    assert len(rows) == 6
    for row in rows:
        assert row['canonical'] == baseline and row['historyComplete'] and row['historyEventCount'] == 62
        assert row['hostedCommands'] == 0 and row['rule'] == references['ownedRule']
        assert row['household'].lower() == HH and row['actor'].lower() in [ALEX, SAM]
        owner = row['actor'].lower() == ALEX
        original = row['originalRuleRecovery']
        if owner:
            assert original == references['originalRequest']['result']
        else:
            assert original['status'] == 'unresolved' and original.get('receipt') is None
        if row['phase'] == 'before':
            assert row['reminder'].get('reminder') is None
            continue
        assert row['reminder']['reminder'] == saved['result']['receipt']['reminder']
        recovery = row['reminderOperationRecovery']
        if owner:
            assert recovery == saved['result']
        else:
            assert recovery['status'] == 'unresolved' and recovery.get('receipt') is None
            assert recovery['operationId'].lower() == OP and recovery['actorId'].lower() == SAM


def verify_restore_and_images():
    value = read(RUN / 'restoration.json')
    assert value['before'] == value['after']
    for key in ['all64JournalsEmpty', 'originalScopesUnchanged', 'largeLight', 'TodayReturnedInTest',
                'foregroundLaunchAfterTests', 'selectedPlansRemoved', 'scopedCaffeinateStopped']:
        assert value[key]
    assert not value['ownedRequestRetained']
    assert all(v == {'appearance': 'light', 'content_size': 'large'} for v in read(RUN / 'initial-ui-settings.json').values())
    review = read(HERE / 'visual-review.json')
    pngs = {str(p.relative_to(HERE)) for p in HERE.rglob('*.png')}
    assert pngs == set(review) and len(pngs) == 12
    for name, entry in review.items():
        assert entry['reviewed'] and entry['safeFictionalScope']
        assert entry['sha256'] == digest((HERE / name).read_bytes())


if __name__ == '__main__':
    count = verify_inventory()
    verify_sources()
    verify_methods(read(HERE / 'outcome.json'))
    verify_reads(verify_request())
    verify_restore_and_images()
    print(json.dumps({'passed': True, 'files': count, 'nativeInputs': 1122,
                      'nativeMethodsPassed': 8, 'nativeMethodsFailed': 0, 'reviewedPNGs': 12}))
