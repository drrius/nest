from pathlib import Path
import gzip,hashlib,json,re,shutil,subprocess,tarfile
root=Path('/private/tmp/nest-native-leftovers-sheet-scope-20261007')
out=root/'success-public';out.mkdir(mode=0o700)
for name in ['prepared.json','products.json','retained-sdk-products.json','retained-sdk-source.json','source-inputs.json','root-before-ready.json','root-placed-ready.json','root-removed-ready.json','final-scope-settled.json']:
    shutil.copy2(root/name,out/name)
steps=['add-alex','placed-alex','placed-sam','read-alex','read-sam','remove-sam','removed-alex','removed-sam']
for step in steps:
    case=root/step;dest=out/step;dest.mkdir()
    summary=json.loads((case/'summary.json').read_text());terminal=json.loads((case/'terminal.json').read_text())
    assert [summary[k] for k in ['passedTests','failedTests','skippedTests']]==[1,0,0]
    assert terminal['methodPassed'] and terminal['restorationPassed']
    for name in ['summary.json','terminal.json','invocation-consumed.json','alex-final.png','sam-final.png']:shutil.copy2(case/name,dest/name)
    raw=(case/'test.log').read_bytes();assert not re.search(rb'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.',raw)
    (dest/'test.log.gz').write_bytes(gzip.compress(raw,mtime=0))
    (dest/'raw-log-hash.json').write_text(json.dumps({'decodedSHA256':hashlib.sha256(raw).hexdigest()},indent=2)+'\n')
    attachments=case/'success-export-attachments'
    subprocess.run(['xcrun','xcresulttool','export','attachments','--path',str(case/'result.xcresult'),'--output-path',str(attachments)],check=True,capture_output=True)
    for p in attachments.iterdir():
        if p.suffix in ['.json','.txt','.png']:
            if p.suffix!='.png':assert not re.search(rb'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.',p.read_bytes())
            shutil.copy2(p,dest/p.name)
with tarfile.open('/private/tmp/nest-leftovers-success-public-20261007.tar','w') as tar:
    for p in out.rglob('*'):
        if p.is_file():tar.add(p,arcname=str(p.relative_to(out)))
print('Eight native passing methods exported; original two before reads retained separately')
