#!/usr/bin/env python3
"""Verify the limit fix against its committed source rather than later edits."""
import hashlib
import io
import json
import subprocess
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
SOURCE = 'a982e8794bdef5131b70fa04254b936a18e51187'


def main():
    rows = json.loads((HERE / 'after-census.json').read_text())
    assert len(rows) == 15
    archive = subprocess.check_output(['git', 'archive', SOURCE, 'apps/ios'], cwd=ROOT)
    with tarfile.open(fileobj=io.BytesIO(archive)) as files:
        for row in rows:
            assert row['fileLines'] <= 400
            assert row['maxFunctionCodeLines'] <= 80
            assert row['maxComplexity'] <= 10
            data = files.extractfile(row['path'])
            assert data is not None
            assert hashlib.sha256(data.read()).hexdigest() == row['sha256'], row['path']
    checker = subprocess.check_output(['git', 'show', SOURCE + ':scripts/check-swift-limits.py'], cwd=ROOT)
    assert b'if TESTS in path.parents or APP_TESTS in path.parents' not in checker
    print(json.dumps({'passed': True, 'source': SOURCE, 'verifiedFiles': len(rows)}))


if __name__ == '__main__':
    main()
