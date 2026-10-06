#!/usr/bin/env python3
"""Verify immutable recipe cancellation proof and its retained failures."""
import hashlib
import io
import json
import re
import subprocess
import tarfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
PINS = {
    'toolbar-observer-failure': ('6b64e0af560e096e473b97fa896baa69f9a90ff7', None),
    'before-cancel-failure': ('6b64e0af560e096e473b97fa896baa69f9a90ff7', '6de1460e4adde6b9fdc8bc00325ec4823fd57356'),
    'delete-key-observer-failure': ('cf10ea160b65f8081c4672567fd6e0d91023a6e4', None),
    'done-target-failure': ('81f2040022b545587d94fb5bb90c2fa9545ab12e', None),
    'done-edge-normal-pass-max-gesture-failure': ('a4afc4a029c7b1fa35a6a83f1bc33d7ce6d1c3a4', None),
    'after': ('aab9b37d276affa267d78949c1496648761ca03d', None),
    'compact-done': ('a432974d66e79b778fb83f82a0f54c17dca1d438', None),
}


def read(path):
    return json.loads(path.read_text())


def digest(data):
    return hashlib.sha256(data).hexdigest()


def verify_text(path, data):
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
    tracked = set(subprocess.check_output(['git', 'ls-files', '--', str(HERE.relative_to(ROOT))], cwd=ROOT, text=True).splitlines())
    assert {str((HERE / p).relative_to(ROOT)) for p in actual | {'sha256.json'}} <= tracked
    for name, value in expected.items():
        path = HERE / name
        data = path.read_bytes()
        assert digest(data) == value, name
        verify_text(path, data)
    for path in HERE.rglob('manifest.json'):
        for test in read(path):
            for attachment in test['attachments']:
                assert (path.parent / attachment['exportedFileName']).is_file()
    review = read(HERE / 'png-review.json')
    assert review['reviewed'] and review['count'] == 81
    assert set(review['files']) == {str(p.relative_to(HERE)) for p in HERE.rglob('*.png')}
    for name, value in read(HERE / 'controllers/executed-sha256.json').items():
        assert digest((HERE / 'controllers' / name).read_bytes()) == value
    return len(actual) + 1


def verify_source(folder, source, override, filename='source-input-hashes.json'):
    raw = subprocess.check_output(['git', 'archive', source, 'apps/ios'], cwd=ROOT)
    inputs = read(HERE / folder / filename)
    assert len(inputs) == 1104
    with tarfile.open(fileobj=io.BytesIO(raw)) as archive:
        for key, value in inputs.items():
            data = archive.extractfile('apps/ios/' + key).read()
            if override and key == 'UITests/NativeRecipeCancelDraftTests.swift':
                data = subprocess.check_output(['git', 'show', override + ':apps/ios/' + key], cwd=ROOT)
            assert digest(data) == value, (folder, key)
    return len(inputs)


def verify_core():
    pin = read(HERE / 'core-regressions/source-pinning.json')
    for key, value in pin['focusedFiles'].items():
        data = subprocess.check_output(['git', 'show', pin['sourceCommit'] + ':' + key], cwd=ROOT)
        assert digest(data) == value, key
    assert pin['testsPassed'] == 6
    assert 'Executed 6 tests, with 0 failures' in (HERE / 'core-regressions/core-test.txt').read_text()


def verify_canonical():
    records = [read(p) for p in HERE.rglob('native-read.json')]
    assert len(records) == 20
    first = records[0]
    for record in records:
        assert record['household'].lower() == 'be772ffd-3ab5-41d5-8438-647a79a553da'
        assert record['actor'].lower() in {'791f7261-6c9d-4061-9c8a-57aa6e0b0200', 'e5f80cfd-b69a-4aa0-a267-75784e943676'}
        assert record['hostedCommands'] == 0 and record['domainHTTPMethods'] == ['GET']
        for key in ['library', 'recipe', 'week', 'planned']:
            assert record[key] == first[key], key
    assert first['recipe']['definitionId'].lower() == '1f5b84c0-8ecb-4f5d-ad33-0a60088b239b'
    assert first['recipe']['title'] == 'Nest native manual week 20261005'
    assert first['week']['revision'] == '9'
    assert first['planned']['entry']['entryId'].lower() == 'f040105f-89b5-4370-aa2f-636c7c284be1'


def verify_results():
    rows = []
    for folder in PINS:
        current = read(HERE / folder / 'results.json')
        rows.extend(current)
        restored = read(HERE / folder / 'restoration.json')
        assert restored['before'] == restored['after']
        assert restored['hostedMutations'] == 0
    assert sum(r['passed'] for r in rows) == 23
    assert sum(r['failed'] for r in rows) == 5
    assert sum(r['skipped'] for r in rows) == 0
    final = read(HERE / 'after/results.json')
    assert len(final) == 5 and all(r['passed'] == 1 and r['failed'] == 0 for r in final)
    assert read(HERE / 'after/terminal.json')['correctedMaximumProfilePassed']
    compact = read(HERE / 'compact-done/results.json')
    assert len(compact) == 5 and all(r['passed'] == 1 and r['failed'] == 0 for r in compact)
    assert read(HERE / 'compact-done/terminal.json')['compactDoneMaximumPassed']
    normal = read(HERE / 'done-edge-normal-pass-max-gesture-failure/results.json')
    assert next(r for r in normal if r['step'] == 'normal_light')['passed'] == 1
    verify_canonical()


if __name__ == '__main__':
    files = verify_artifacts()
    for folder, (source, override) in PINS.items():
        verify_source(folder, source, override)
    verify_source('after', 'a4afc4a029c7b1fa35a6a83f1bc33d7ce6d1c3a4', None, 'sdk-source-input-hashes.json')
    verify_core()
    verify_results()
    print(json.dumps({'passed': True, 'files': files, 'sourceMaps': 7, 'inputsPerMap': 1104, 'nativePassed': 23, 'nativeFailedRetained': 5, 'focusedCorePassed': 6}))
