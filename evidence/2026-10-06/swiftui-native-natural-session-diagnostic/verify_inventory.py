#!/usr/bin/env python3
"""Verify the retained failure and safe isolated-session observation."""
import hashlib
import io
import json
import re
import subprocess
import tarfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SOURCES = {
    'paused-read-failure': ('8313d7623eb109f640752c5ce9696d797d4811e9', 1106),
    'diagnostic': ('1e8a5869d818dd1824d6c7c8bc01a2b998a026b9', 1107),
}


def read(path):
    return json.loads(path.read_text())


def digest(data):
    return hashlib.sha256(data).hexdigest()


def verify_artifacts():
    expected = read(HERE / 'sha256.json')
    actual = {str(p.relative_to(HERE)) for p in HERE.rglob('*') if p.is_file() and p.name != 'sha256.json'}
    assert actual == set(expected)
    tracked = set(subprocess.check_output(['git', 'ls-files', '--', str(HERE.relative_to(ROOT))], cwd=ROOT, text=True).splitlines())
    assert {str((HERE / p).relative_to(ROOT)) for p in actual | {'sha256.json'}} <= tracked
    for name, value in expected.items():
        data = (HERE / name).read_bytes()
        assert digest(data) == value, name
        text = data.decode()
        assert not re.search(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.', text), name
        assert not re.search(r'Bearer\s+[A-Za-z0-9_.-]+', text, re.I), name
        assert not re.search(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----', text), name
    for path in HERE.rglob('manifest.json'):
        for test in read(path):
            for attachment in test['attachments']:
                assert (path.parent / attachment['exportedFileName']).is_file()
    assert not list(HERE.rglob('*.png'))
    return len(actual) + 1


def verify_sources():
    for folder, (commit, count) in SOURCES.items():
        raw = subprocess.check_output(['git', 'archive', commit, 'apps/ios'], cwd=ROOT)
        inputs = read(HERE / folder / 'source-input-hashes.json')
        assert len(inputs) == count
        with tarfile.open(fileobj=io.BytesIO(raw)) as archive:
            for key, value in inputs.items():
                assert digest(archive.extractfile('apps/ios/' + key).read()) == value, (folder, key)


def verify_results():
    failed = read(HERE / 'paused-read-failure/results.json')
    assert len(failed) == 1 and failed[0]['failed'] == 1 and failed[0]['passed'] == 0
    rows = read(HERE / 'diagnostic/results.json')
    assert len(rows) == 1 and rows[0]['passed'] == 1 and rows[0]['failed'] == 0
    verify_report()
    for folder in SOURCES:
        restored = read(HERE / folder / 'restoration.json')
        assert restored['before'] == restored['after'] and restored['hostedMutations'] == 0


def verify_report():
    report = read(HERE / 'diagnostic/diagnostic.json')
    assert report['nativeMembershipVerified'] and report['diagnosticOnly']
    assert report['responses'] == [{'capturedAt': 1791280109.084219, 'channel': 'domain', 'path': '/v1/session', 'status': 200}]
    assert report['original']['cachedExpiresAt'] == report['original']['JWTExpiresAt']
    assert not report['original']['cachedSessionExpired'] and not report['original']['JWTExpiredAtCapture']
    assert report['original']['sessionFingerprint'] == report['returned']['sessionFingerprint']
    assert not report['expiresAtModified'] and not report['promotedAfterVerification']
    assert not report['originalKeychainDeletedByTest'] and report['originalAvailableAtFinish']


if __name__ == '__main__':
    files = verify_artifacts()
    verify_sources()
    verify_results()
    print(json.dumps({'passed': True, 'files': files, 'diagnosticPassed': 1, 'retainedPausedReadFailed': 1, 'providerRequestsInDiagnostic': 0, 'nativeSessionStatus': 200}))
