from pathlib import Path
import hashlib,json,re,shutil,subprocess
SOURCE=Path('/private/tmp/nest-renewal-offline-ui-20261006')
OUT=Path('/private/tmp/nest-renewal-offline-ui-public-20261006')
assert not OUT.exists();OUT.mkdir(mode=0o700)
assert json.loads((SOURCE/'terminal.json').read_text())['success']
for name in ['results.json','restoration.json','terminal.json','relay-events.json']:
    shutil.copy2(SOURCE/name,OUT/name)
shutil.copy2(SOURCE/'source-inputs-private.json',OUT/'source-input-hashes.json')
for key in ['alex','sam']:
    target=OUT/key;target.mkdir()
    summary=json.loads(subprocess.check_output(['xcrun','xcresulttool','get','test-results','summary','--path',str(SOURCE/key/'result.xcresult')],text=True))
    (target/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
    log=(SOURCE/key/'test.log').read_text()
    assert not re.search(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.',log)
    assert not re.search(r'Bearer\s+[A-Za-z0-9_.-]+',log,re.I)
    (target/'native-test.txt').write_text('\n'.join(s.rstrip() for s in log.splitlines())+'\n')
    for file in (SOURCE/key/'attachments').iterdir():
        assert file.suffix in {'.png','.txt','.json'}
        shutil.copy2(file,target/file.name)
for file in SOURCE.glob('*-restored-today.png'):shutil.copy2(file,OUT/file.name)
print(json.dumps({'safeExportFiles':len([p for p in OUT.rglob('*') if p.is_file()]),'output':str(OUT)}))
