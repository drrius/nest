#!/usr/bin/env python3
"""Check immutable active variable-rule evidence; never run API or UI actions."""
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
SOURCE = 'c0cd3a8da4f1f56e8566a3e4da47d89346e379b0'
DONE_SOURCE = '486963a1cf667aecb6379b4efb619ef7cac0bd9c'


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
    first = HERE / 'creation-and-recorded-done'
    final = HERE / 'known-done-only'
    before = source(SOURCE, first / 'source-input-hashes.json', 1118)
    after = source(DONE_SOURCE, final / 'source-input-hashes.json', 1118)
    assert source(SOURCE, final / 'sdk-source-input-hashes.json', 1118) == before
    changed = {key for key in before if before[key] != after[key]}
    assert changed == {'UITests/NativeActiveRecurringReminderFixtureTests.swift'}
    for location, schemes in [(first, ['Nest', 'NestAccessibility']), (final, ['NestAccessibility'])]:
        for scheme in schemes:
            value = read(location / (scheme + '-build-attestation.json'))
            assert value['freshDirectoryRequired'] and value['ownedSourceCompileLines']
            assert len(value['binarySha256']) >= 3
            assert all(re.fullmatch('[0-9a-f]{64}', h) for h in value['binarySha256'].values())
            assert value['resolvedProductPaths']
    assert read(first / 'Nest-build-attestation.json') == read(final / 'Nest-build-attestation.json')


def verify_methods(outcome):
    first = read(HERE / 'creation-and-recorded-done/results.json')
    final = read(HERE / 'known-done-only/results.json')
    assert len(first) == 8 and sum(r['failed'] for r in first) == 1
    assert first[2]['method'].endswith('testCreateOneFutureVariableRuleThroughNativeReview')
    assert first[2]['passed'] == 1 and first[2]['seconds'] == 89.247
    assert first[5]['failed'] == 1 and first[5]['seconds'] == 103.124
    assert len(final) == 3 and all(r['passed'] == 1 and r['failed'] == 0 for r in final)
    assert final[0]['seconds'] == 61.146
    assert sum(r['passed'] for r in first + final) == outcome['nativeMethodsPassed'] == 10
    assert sum(r['failed'] for r in first + final) == outcome['nativeMethodsFailed'] == 1
    assert all(r['skipped'] == 0 for r in first + final)
    for name, value in outcome['controllerSha256'].items():
        assert digest((HERE / name).read_bytes()) == value


def verify_canonical():
    first = HERE / 'creation-and-recorded-done'
    baseline = read(first / 'baseline.json')
    rules = baseline['originalRules']
    assert len(rules) == 7
    assert sorted(r['status'] for r in rules) == ['cancelled'] * 3 + ['paused'] * 4
    pages = baseline['historyPages']
    assert pages[-1].get('next') is None and sum(len(p['events']) for p in pages) == 62
    expected = read(first / 'owned-variable-request.json')
    assert expected['result']['status'] == 'recorded' and not expected['cancellationRequested']
    receipt = expected['result']['receipt']
    expected_rule = read(first / 'alex-recorded/native-read.json')['rule']
    config = expected_rule['configuration']
    assert config['mode'] == 'variable' and config['description'] == 'Nest QA reminder bill 0610-5d1a'
    assert config['startDate'] == expected_rule['nextDueOn'] == '2026-11-01'
    assert expected_rule['status'] == 'active'
    assert config['schedule'] == {'kind': 'monthly', 'dayOfMonth': 1}
    assert all(config.get(k) is None for k in ['amountCentimes', 'allocations', 'categoryId', 'note'])
    for path in HERE.rglob('native-read.json'):
        row = read(path)
        assert row['canonical'] == baseline and row['historyComplete'] and row['historyEventCount'] == 62
        assert row['hostedCommands'] == 0
        capture = row['phase'] == 'baseline' and path.parent.name == 'alex-before'
        assert row['baselineComparisonPerformed'] != capture
        if row['phase'] == 'created':
            assert row['rule'] == expected_rule
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
    first = read(HERE / 'creation-and-recorded-done/restoration.json')
    assert first['ownedRequestRetained'] and first['after']['alex']['emptyJournals'] == 63
    value = read(HERE / 'known-done-only/restoration.json')
    for key in ['all64JournalsEmpty', 'originalScopesUnchanged', 'largeLight',
                'foregroundLaunchAfterTests', 'selectedPlansRemoved', 'scopedCaffeinateStopped', 'TodayReturnedInTest']:
        assert value[key]
    assert not value['ownedRequestRetained']
    assert all(scope['emptyJournals'] == 64 and scope['ownedRecurringRequest'] == 0 for scope in value['after'].values())
    assert read(HERE / 'known-done-only/terminal.json')['POSTBudget'] == 0


if __name__ == '__main__':
    count = verify_artifacts()
    outcome = read(HERE / 'outcome.json')
    verify_visual(outcome)
    verify_builds()
    verify_methods(outcome)
    verify_canonical()
    verify_restore()
    print(json.dumps({'passed': True, 'files': count, 'NativeInputs': 1118,
                      'nativeMethodsPassed': 10, 'nativeMethodsFailed': 1, 'reviewedPNGs': 29, 'POSTs': 1}))
