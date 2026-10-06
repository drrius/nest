#!/usr/bin/env python3
"""Verify immutable phase-one native fixture evidence without executing hosted commands."""
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
UI_SOURCE = 'cc81310a5ea2910556382ce3cedd322d72f35e8b'
SDK_SOURCE = '68b7632df7d14805d3b1e1d552d0df0a5bc2c9e4'
HH = 'be772ffd-3ab5-41d5-8438-647a79a553da'
ALEX = '791f7261-6c9d-4061-9c8a-57aa6e0b0200'
SAM = 'e5f80cfd-b69a-4aa0-a267-75784e943676'
ITEM = '23435fe5-5b08-48cd-b0fb-03f0e2d49690'
OP = 'bf8ff1ab-f27c-4481-9769-a41a9c96f652'


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
    verify_visual()
    return len(actual) + 1


def verify_visual():
    for path in HERE.rglob('manifest.json'):
        for test in read(path):
            for attachment in test['attachments']:
                assert (path.parent / attachment['exportedFileName']).is_file()
    review = read(HERE / 'visual-review.json')
    pngs = {str(p.relative_to(HERE)) for p in HERE.rglob('*.png')}
    assert pngs == set(review) and len(pngs) == 34
    for name, value in review.items():
        assert value['reviewed'] and value['safeFictionalScope']
        assert value['sha256'] == digest((HERE / name).read_bytes())



def verify_source(commit, location):
    inputs = read(location)
    assert len(inputs) == 1110
    raw = subprocess.check_output(['git', 'archive', commit, 'apps/ios'], cwd=ROOT)
    with tarfile.open(fileobj=io.BytesIO(raw)) as archive:
        for key, value in inputs.items():
            assert digest(archive.extractfile('apps/ios/' + key).read()) == value, key
    return inputs


def verify_batches(outcome):
    passed = failed = 0
    for folder, expected in outcome['batches'].items():
        path = HERE / folder
        verify_source(expected['sourceCommit'], path / 'source-input-hashes.json')
        assert digest((path / 'executed-controller.py').read_bytes()) == expected['controllerSha256']
        rows = read(path / 'results.json') if (path / 'results.json').exists() else []
        assert len(rows) == expected['methods']
        assert sum(row['passed'] for row in rows) == expected['passed']
        assert sum(row['failed'] for row in rows) == expected['failed']
        assert all(row['skipped'] == 0 for row in rows)
        passed += expected['passed']
        failed += expected['failed']
    assert (passed, failed) == (12, 3)
    source = verify_source(UI_SOURCE, HERE / 'done-recovery/source-input-hashes.json')
    sdk = verify_source(SDK_SOURCE, HERE / 'done-recovery/sdk-source-input-hashes.json')
    assert {key for key in source if source[key] != sdk[key]} == {'UITests/NativeActiveRenewalReminderTests.swift'}
    assert digest((HERE / 'foreground-restoration/executed-controller.py').read_bytes()) == outcome['foregroundControllerSha256']


def records():
    names = ['picker-observer-failure/alex-before', 'picker-observer-failure/sam-before',
             'created/alex-before', 'created/sam-before', 'created/alex-created', 'created/sam-created',
             'done-recovery/alex-after', 'done-recovery/sam-after']
    return [read(HERE / name / 'native-read.json') for name in names]


def verify_canonical():
    values = records()
    baseline = read(HERE / 'created/baseline.json')
    assert all(value['canonical'] == baseline for value in values)
    assert all(value['historyComplete'] and value['historyEventCount'] == 62 for value in values)
    assert baseline['historyPages'][-1].get('next') is None
    assert sum(len(page['events']) for page in baseline['historyPages']) == 62
    assert baseline['rulePages'][-1].get('next') is None
    assert sum(len(page['rules']) for page in baseline['rulePages']) == 7
    assert sorted(member['centimes'] for member in baseline['balance']['members']) == ['-1', '1']
    assert baseline['priorRemovedRenewal']['renewalId'].lower() == '17919246-d8ec-4402-b301-da1149d1cc35'
    assert baseline['priorRemovedRenewal']['removed']
    assert baseline['originalActiveRenewals'] == []
    for value in values[:4]:
        assert value['renewalPages'][-1].get('next') is None
        assert all(not page['renewals'] for page in value['renewalPages'])
    return values[4:]


def verify_receipt(values):
    request = read(HERE / 'created/owned-created-request.json')
    assert request == read(HERE / 'created/owned-intent-at-stop.json')
    assert request == read(HERE / 'done-recovery/owned-request-before-done.json')
    command = request['command']
    assert command['operationId'].lower() == OP and command['renewalId'].lower() == ITEM
    assert command.get('expectedRevision') is None and request.get('baseline') is None
    assert not request['cancellationRequested'] and request['result']['status'] == 'recorded'
    receipt = request['result']['receipt']
    assert receipt['actorId'].lower() == ALEX and receipt['householdId'].lower() == HH
    assert receipt['command'] == command and receipt['operationId'].lower() == OP
    renewal = receipt['renewal']
    assert renewal['renewalId'].lower() == ITEM and not renewal['removed']
    assert renewal['revision'].lower() == '6610131c-d4d9-42fc-89f2-42ffe0a7b777'
    assert renewal['fields'] == {'title': 'Nest QA reminder 0610-3f88', 'renewalOn': '2026-10-07',
                                'noticeDays': 0, 'responsibleId': None, 'recurringRuleId': None}
    assert renewal['cancellationOn'] == '2026-10-07'
    verify_readback(values, renewal, request['result'])


def verify_readback(values, renewal, recorded):
    for value in values:
        assert value['renewal'] == renewal
        envelope = value['reminder']
        assert envelope == values[0]['reminder']
        assert (envelope['householdId'].lower(), envelope['renewalId'].lower(), envelope.get('reminder')) == (HH, ITEM, None)
        assert envelope['version'] == 1
        assert value['renewalPages'][-1].get('next') is None
        assert [row for page in value['renewalPages'] for row in page['renewals']] == [renewal]
        assert value['ownerRecovery'] == (recorded if value['actor'].lower() == ALEX else None)


def verify_recovery():
    before = read(HERE / 'created/restoration.json')['after']
    assert before['alex']['emptyJournals'] == 63 and before['alex']['ownedRenewalRequest'] == 1
    assert before['sam']['emptyJournals'] == 64
    done = read(HERE / 'done-recovery/terminal.json')
    assert done['DoneObserved'] and done['BothCanonicalAfterReadsPassed'] and done['AdditionalServerCommands'] == 0
    restored = read(HERE / 'foreground-restoration/restoration.json')
    assert restored['ordinaryForegroundLaunchOnly'] and restored['all64JournalsEmpty'] and restored['largeLight']
    for role, actor in [('alex', ALEX), ('sam', SAM)]:
        state = restored['after'][role]
        assert (state['actor'], state['household'], state['emptyJournals']) == (actor, HH, 64)
        for key in ['databaseName', 'device', 'inode', 'snapshotCounts']:
            assert restored['before'][role][key] == state[key]
    alpha = read(HERE / 'alex-cold-launch/restoration.json')
    assert alpha['before']['alex']['state']['actor'] is None
    assert alpha['after']['alex']['state']['actor'] == ALEX and alpha['UIOnlyOriginalIdentityPassed']
    assert read(HERE / 'alex-cold-launch/controller-failure.json')['controllerResult'] == 'FAIL'
    assert read(HERE / 'scope-assessment/conclusion.json')['exact401CallerUnknown']


def verify_working_tree():
    expected = read(HERE / 'done-recovery/source-input-hashes.json')
    base = ROOT / 'apps/ios'
    actual = {str(p.relative_to(base)): digest(p.read_bytes()) for folder in ['Nest', 'AppTests', 'UITests', 'Tests', 'Nest.xcodeproj']
              for p in (base / folder).rglob('*') if p.is_file() and 'xcuserdata' not in p.parts and p.name != 'README.md'}
    assert actual == expected


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--working-tree', action='store_true')
    args = parser.parse_args()
    count = verify_artifacts()
    outcome = read(HERE / 'outcome.json')
    assert outcome['deliberateCreateCommands'] == 1 and outcome['CreateReplays'] == 0
    assert outcome['reminderSaveCommands'] == outcome['RemoveCommands'] == 0
    assert outcome['separateCompileFailures'] == outcome['separatePostUIControllerFailures'] == 1
    verify_batches(outcome)
    verify_receipt(verify_canonical())
    verify_recovery()
    if args.working_tree:
        verify_working_tree()
    print(json.dumps({'passed': True, 'files': count, 'inputsPerVariant': 1110, 'nativePasses': 12,
                      'retainedNativeFailures': 3, 'separateCompileFailures': 1, 'separateControllerFailures': 1,
                      'reviewedPNGs': 34, 'deliberateCreateCommands': 1, 'CreateReplays': 0}))
