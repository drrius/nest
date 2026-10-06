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
SDK_SOURCE = '68b7632df7d14805d3b1e1d552d0df0a5bc2c9e4'
FINAL_UI_SOURCE = '678cd33eda1f20fb3c5142719517920449f81a98'


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


def verify_readbacks(folder):
    baseline = read(HERE / folder / 'phase1-canonical-baseline.json')
    request = read(HERE / folder / 'expected-request.json')
    renewal = request['result']['receipt']['renewal']
    values = [read(HERE / folder / name / 'native-read.json') for name in ['alex-before', 'sam-before', 'alex-after', 'sam-after']]
    assert baseline['historyPages'][-1].get('next') is None
    assert sum(len(page['events']) for page in baseline['historyPages']) == 62
    assert sorted(member['centimes'] for member in baseline['balance']['members']) == ['-1', '1']
    assert renewal['renewalId'].lower() == '23435fe5-5b08-48cd-b0fb-03f0e2d49690'
    assert renewal['revision'].lower() == '6610131c-d4d9-42fc-89f2-42ffe0a7b777'
    assert not renewal['removed']
    for value in values:
        assert value['canonical'] == baseline and value['renewal'] == renewal
        assert value['historyComplete'] and value['historyEventCount'] == 62
        assert value['reminder'] == values[0]['reminder'] and value['reminder'].get('reminder') is None
        assert value['hostedCommands'] == 0
    return baseline


def verify_restore(folder):
    restored = read(HERE / folder / 'restoration.json')
    assert restored['before'] == restored['after'] and restored['all64JournalsEmpty']
    assert restored['largeLight'] and restored['foregroundLaunchAfterSDK']
    assert restored['selectedPlansRemoved'] and restored['scopedCaffeinateStopped']
    durable = read(HERE / folder / 'durable-database-observation.json')
    for actor in ['alex', 'sam']:
        for key in ['databaseName', 'device', 'inode', 'snapshotCounts']:
            assert durable['before'][actor][key] == durable['after'][actor][key]
    terminal = read(HERE / folder / 'terminal.json')
    assert terminal['POSTs'] == terminal['ReminderSaves'] == terminal['Removes'] == terminal['CreateReplays'] == 0
    assert terminal['bothFinalCanonicalReadsPassed'] and terminal['fixtureStillActive'] and terminal['reminderStillNil']


def verify_batches(outcome):
    passed = failed = 0
    baseline = None
    for folder, expected in outcome['batches'].items():
        location = HERE / folder
        actual = source(expected['sourceCommit'], location / 'source-input-hashes.json', 1111)
        sdk = source(SDK_SOURCE, location / 'sdk-source-input-hashes.json', 1110)
        assert {k: v for k, v in actual.items() if not k.startswith('UITests/')} == {k: v for k, v in sdk.items() if not k.startswith('UITests/')}
        assert digest((location / 'executed-controller.py').read_bytes()) == expected['controllerSha256']
        rows = read(location / 'results.json')
        assert len(rows) == expected['methods']
        assert sum(row['passed'] for row in rows) == expected['passed']
        assert sum(row['failed'] for row in rows) == expected['failed']
        assert all(row['skipped'] == 0 for row in rows)
        current = verify_readbacks(folder)
        if baseline is not None:
            assert current == baseline
        baseline = current
        verify_restore(folder)
        passed += expected['passed']
        failed += expected['failed']
    assert (passed, failed) == (outcome['nativeMethodsPassed'], outcome['retainedNativeFailures'])


def verify_profile_coverage():
    normal = read(HERE / 'normal-passed-max-list-failure/results.json')
    assert next(row for row in normal if row['step'] == 'normal_light')['passed'] == 1
    assert next(row for row in normal if row['step'] == 'maximum_dark')['failed'] == 1
    final = read(HERE / 'maximum-ordered-traversal/results.json')
    assert all(row['passed'] == 1 and row['failed'] == row['exitCode'] == 0 for row in final)
    assert all(row['step'] != 'normal_light' for row in final)
    assert read(HERE / 'maximum-ordered-traversal/terminal.json')['maximumProfilePassed']


def verify_working_tree():
    expected = read(HERE / 'maximum-ordered-traversal/source-input-hashes.json')
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
    verify_visual(outcome)
    verify_batches(outcome)
    verify_profile_coverage()
    if args.working_tree:
        verify_working_tree()
    print(json.dumps({'passed': True, 'files': count, 'UIInputsPerVariant': 1111, 'SDKInputs': 1110,
                      'nativeMethodsPassed': outcome['nativeMethodsPassed'], 'retainedNativeFailures': outcome['retainedNativeFailures'],
                      'reviewedPNGs': outcome['reviewedPNGs'], 'hostedCommands': 0}))
