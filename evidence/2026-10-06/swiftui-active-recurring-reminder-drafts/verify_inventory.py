#!/usr/bin/env python3
"""Check immutable active bill unsent-draft evidence; never run API or UI actions."""
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
SDK_SOURCE = 'c0cd3a8da4f1f56e8566a3e4da47d89346e379b0'
VARIANTS = {
    'active-draft-run': 'a5f1a945f73f4ce868b3ccdd637d6da2acbd6cfd',
    'corrected-unique-form': 'ed97c1985cc6083befe329f729c8583a042a6f34',
    'maximum-list-travel': 'b79c5766989973e916674c09e1ea933fea020535',
}


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


def verify_builds():
    sdk = None
    for name, commit in VARIANTS.items():
        location = HERE / name
        current = source(commit, location / 'source-input-hashes.json', 1119)
        original = source(SDK_SOURCE, location / 'sdk-source-input-hashes.json', 1118)
        assert {k: v for k, v in current.items() if not k.startswith('UITests/')} == {
            k: v for k, v in original.items() if not k.startswith('UITests/')}
        reused = read(location / 'Nest-build-attestation.json')
        if sdk is not None:
            assert reused == sdk
        sdk = reused
        value = read(location / 'NestAccessibility-build-attestation.json')
        assert value['freshDirectoryRequired'] and value['resolvedProductPaths']
        assert 'NativeActiveRecurringReminderDraftTests.swift' in str(value['ownedSourceCompileLines'])
        assert len(value['binarySha256']) >= 3
        assert all(re.fullmatch('[0-9a-f]{64}', h) for h in value['binarySha256'].values())


def verify_methods(outcome):
    initial = read(HERE / 'active-draft-run/results.json')
    normal = read(HERE / 'corrected-unique-form/results.json')
    maximum = read(HERE / 'maximum-list-travel/results.json')
    assert len(initial) == 5 and initial[2]['failed'] == 1 and initial[2]['seconds'] == 58.914
    assert len(normal) == 6 and normal[2]['passed'] == 1 and normal[2]['seconds'] == 209.976
    assert normal[3]['failed'] == 1 and normal[3]['seconds'] == 145.464
    assert len(maximum) == 5 and maximum[2]['passed'] == 1 and maximum[2]['seconds'] == 612.956
    assert maximum[2]['method'].endswith('testMaximumDarkOwnedActiveBillUnsentDraft')
    rows = initial + normal + maximum
    assert sum(r['passed'] for r in rows) == outcome['nativeMethodsPassed'] == 14
    assert sum(r['failed'] for r in rows) == outcome['nativeMethodsFailed'] == 2
    assert all(r['skipped'] == 0 for r in rows)
    for name, value in outcome['controllerSha256'].items():
        assert digest((HERE / name).read_bytes()) == value


def verify_canonical():
    location = HERE / 'maximum-list-travel'
    baseline = read(location / 'baseline.json')
    rules = baseline['originalRules']
    assert len(rules) == 7 and sorted(r['status'] for r in rules) == ['cancelled'] * 3 + ['paused'] * 4
    pages = baseline['historyPages']
    assert pages[-1].get('next') is None and sum(len(p['events']) for p in pages) == 62
    expected = read(location / 'owned-original-request.json')
    assert expected['result']['status'] == 'recorded' and not expected['cancellationRequested']
    receipt = expected['result']['receipt']
    expected_rule = read(location / 'alex-before/native-read.json')['rule']
    assert expected_rule['ruleId'].lower() == 'f854e3a3-ffda-4eb7-86e5-d3933d938444'
    assert expected_rule['revision'].lower() == '528417a1-b97a-4be4-9e63-ad7c8c03c2be'
    assert expected_rule['status'] == 'active' and expected_rule['nextDueOn'] == '2026-11-01'
    assert expected_rule['configuration']['mode'] == 'variable'
    records = list(HERE.rglob('native-read.json'))
    assert len(records) == 12
    for path in records:
        row = read(path)
        assert row['phase'] == 'created' and row['baselineComparisonPerformed']
        assert row['canonical'] == baseline and row['historyComplete'] and row['historyEventCount'] == 62
        assert row['hostedCommands'] == 0 and row['rule'] == expected_rule
        context = row['reminder']
        assert context['rule'] == expected_rule and context.get('reminder') is None
        assert context['version'] == 1 and context['householdId'].lower() == row['household'].lower()
        recovery = row['recovery']
        assert recovery['operationId'].lower() == receipt['operationId'].lower()
        if row['actor'].lower() == receipt['actorId'].lower():
            assert recovery == expected['result']
        else:
            assert recovery['status'] == 'unresolved' and recovery.get('receipt') is None
            assert recovery['actorId'].lower() == row['actor'].lower()


def verify_restore():
    for name in VARIANTS:
        value = read(HERE / name / 'restoration.json')
        assert value['before'] == value['after']
        for key in ['all64JournalsEmpty', 'originalScopesUnchanged', 'largeLight',
                    'foregroundLaunchAfterTests', 'selectedPlansRemoved', 'scopedCaffeinateStopped']:
            assert value[key]
        assert read(HERE / name / 'terminal.json')['POSTs'] == 0
    final = read(HERE / 'maximum-list-travel/restoration.json')
    assert final['allExecutedUnsentDraftsDiscarded']


if __name__ == '__main__':
    count = verify_artifacts()
    outcome = read(HERE / 'outcome.json')
    verify_visual(outcome)
    verify_builds()
    verify_methods(outcome)
    verify_canonical()
    verify_restore()
    print(json.dumps({'passed': True, 'files': count, 'UIInputs': 1119, 'SDKInputs': 1118,
                      'nativeMethodsPassed': 14, 'nativeMethodsFailed': 2, 'reviewedPNGs': 47, 'POSTs': 0}))
