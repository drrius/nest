#!/usr/bin/env python3
"""Check immutable Meals contrast evidence; never run API or UI actions."""
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
SOURCE = '971553a68d31d7228e17a5598d8ac6cdf35fcfc5'


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


def verify_audit(outcome):
    location = HERE / 'audit'
    source(SOURCE, location / 'source-input-hashes.json', 1116)
    assert digest((HERE / 'executed-controller.py').read_bytes()) == outcome['controllerSha256']
    attested = read(location / 'NestAccessibility-build-attestation.json')
    assert attested['freshDirectoryRequired']
    assert 'NativeMealsContrastViewportTests.swift' in str(attested['ownedSourceCompileLines'])
    assert len(attested['binarySha256']) >= 3
    assert all(re.fullmatch('[0-9a-f]{64}', value) for value in attested['binarySha256'].values())
    rows = read(location / 'results.json')
    assert len(rows) == 1 and (rows[0]['passed'], rows[0]['failed'], rows[0]['skipped']) == (0, 1, 0)
    assert rows[0]['seconds'] == 35.465
    calls = read(location / 'audit-invocations.json')
    assert len(calls) == 1 and calls[0]['auditInvocations'] == 1 and calls[0]['filteredFindings'] == 0
    placements = read(location / 'placement.json')
    final = placements[0][-1]
    assert final['exists'] and final['hittable'] and final['label'] == 'Tuesday · 6 Oct'
    assert final['frame'] == [20, 470, 143, 24]
    assert final['tabBar'][1] - (final['frame'][1] + final['frame'][3]) == 90
    findings = read(location / 'findings.json')
    assert len(findings) == 4 and sorted(item['label'] for item in findings) == ['Add meal', 'Add meal', 'Dinner', 'Lunch']
    assert all(item['frame'][1] >= item['tabBarFrame'][1] for item in findings)
    prior = read(HERE / 'prior-meals-findings.json')
    assert len(prior) == 3 and sum(not item['label'] for item in prior) == 2
    assert not outcome['priorAnonymousReportsClosed'] and outcome['rootAuditReportsClosed'] == 0


def verify_restore():
    value = read(HERE / 'audit/restoration.json')
    assert value['before'] == value['after']
    assert value['all64JournalsEmpty'] and value['originalScopesUnchanged']
    assert value['largeLight'] and value['foregroundLaunchAfterTest']
    assert value['selectedPlansRemoved'] and value['scopedCaffeinateStopped']
    terminal = read(HERE / 'audit/terminal.json')
    assert terminal['OneMethodCompleted'] and terminal['NoRepeatedAudit']
    assert terminal['POSTs'] == 0 and not terminal['SDKExecuted']


if __name__ == '__main__':
    count = verify_artifacts()
    outcome = read(HERE / 'outcome.json')
    verify_visual(outcome)
    verify_audit(outcome)
    verify_restore()
    print(json.dumps({'passed': True, 'files': count, 'NativeInputs': 1116, 'nativeMethodsFailed': 1,
                      'contrastFindings': 4, 'TuesdayFindings': 0, 'reviewedPNGs': 12, 'POSTs': 0}))
