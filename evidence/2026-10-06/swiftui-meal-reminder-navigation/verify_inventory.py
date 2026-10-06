#!/usr/bin/env python3
"""Verify immutable real-meal reminder draft navigation artifacts."""
import hashlib
import io
import json
import re
import subprocess
import tarfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SOURCE = '204d13d0f65da677b905477d913d737ffcf2c028'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def verify_artifacts():
    expected = json.loads((HERE / 'sha256.json').read_text())
    actual = {str(p.relative_to(HERE)) for p in HERE.rglob('*') if p.is_file() and p.name != 'sha256.json'}
    assert actual == set(expected)
    tracked = set(subprocess.check_output(['git', 'ls-files', '--', str(HERE.relative_to(ROOT))], cwd=ROOT, text=True).splitlines())
    assert {str((HERE / p).relative_to(ROOT)) for p in actual | {'sha256.json'}} <= tracked
    for name, value in expected.items():
        path = HERE / name
        data = path.read_bytes()
        assert digest(data) == value, name
        if path.suffix != '.png':
            text = data.decode()
            assert not re.search(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.', text), name
            assert not re.search(r'Bearer\s+[A-Za-z0-9_.-]+', text, re.I), name
            assert not re.search(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----', text), name
    for path in HERE.rglob('manifest.json'):
        for test in json.loads(path.read_text()):
            for attachment in test['attachments']:
                assert (path.parent / attachment['exportedFileName']).is_file()
    return len(actual) + 1


def verify_sources():
    raw = subprocess.check_output(['git', 'archive', SOURCE, 'apps/ios'], cwd=ROOT)
    inputs = json.loads((HERE / 'source-input-hashes.json').read_text())
    with tarfile.open(fileobj=io.BytesIO(raw)) as archive:
        for key, value in inputs.items():
            assert digest(archive.extractfile('apps/ios/' + key).read()) == value, key
    assert len(inputs) == 1102
    return len(inputs)


def verify_canonical():
    records = [json.loads((HERE / key / 'native-read.json').read_text()) for key in ['alex-before', 'sam-before', 'alex-after', 'sam-after']]
    for key in ['context', 'week', 'planned', 'roster', 'editorSettings']:
        assert all(v[key] == records[0][key] for v in records)
    context = records[0]['context']
    assert context['meal']['entryId'].lower() == 'f040105f-89b5-4370-aa2f-636c7c284be1'
    assert context['meal']['date'] == '2026-10-19' and context['meal']['slot'] == 'dinner'
    assert context['meal']['title'] == 'Nest native manual week 20261005'
    assert context.get('reminder') is None
    assert records[0]['week']['revision'] == '9'


def verify_results():
    rows = json.loads((HERE / 'results.json').read_text())
    assert len(rows) == 6
    assert all(r['passed'] == 1 and r['failed'] == r['skipped'] == 0 for r in rows)
    restored = json.loads((HERE / 'restoration.json').read_text())
    assert restored['before'] == restored['after']
    assert restored['hostedMutations'] == 0
    verify_canonical()


if __name__ == '__main__':
    files = verify_artifacts()
    inputs = verify_sources()
    verify_results()
    print(json.dumps({'passed': True, 'files': files, 'nativeInputs': inputs, 'nativeMethods': 6, 'source': SOURCE}))
