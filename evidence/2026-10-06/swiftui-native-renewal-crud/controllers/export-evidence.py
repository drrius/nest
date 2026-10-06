from pathlib import Path
import hashlib, json, os, re, shutil, subprocess
os.umask(0o077)
SOURCES=[Path('/private/tmp/nest-native-renewal-baseline-20261006'),Path('/private/tmp/nest-native-renewal-crud-20261006')]
OUT=Path('/private/tmp/nest-native-renewal-public-evidence-20261006')
assert not OUT.exists()
OUT.mkdir(mode=0o700)
for source in SOURCES:
    dest=OUT/('baseline' if 'baseline' in source.name else 'journey');dest.mkdir()
    for file in source.glob('*.json'):
        if '-private' in file.name:continue
        shutil.copy2(file,dest/file.name)
    for file in source.glob('*-source-inputs-private.json'):
        shutil.copy2(file,dest/file.name.replace('-private',''))
    if (source/'source-inputs-private.json').exists():
        shutil.copy2(source/'source-inputs-private.json',dest/'source-input-hashes.json')
    for file in source.glob('*.png'):shutil.copy2(file,dest/file.name)
    for saved in source.glob('*-saved-request.json'):shutil.copy2(saved,dest/saved.name)
    for case in source.iterdir():
        if not case.is_dir() or not (case/'result.xcresult').exists():continue
        caseout=dest/case.name;caseout.mkdir()
        summary=json.loads(subprocess.check_output(['xcrun','xcresulttool','get','test-results','summary','--path',str(case/'result.xcresult')],text=True))
        (caseout/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
        if not (case/'attachments').exists():
            subprocess.run(['xcrun','xcresulttool','export','attachments','--path',str(case/'result.xcresult'),'--output-path',str(case/'attachments')],check=True,capture_output=True)
        for file in (case/'attachments').iterdir():
            if file.suffix.lower() in ['.png','.json','.txt'] or file.name=='manifest.json':shutil.copy2(file,caseout/file.name)
        if (case/'native-read.json').exists():shutil.copy2(case/'native-read.json',caseout/'native-read.json')
        log=(case/'test.log').read_text()
        assert not re.search(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.',log)
        assert not re.search(r'Bearer\s+[A-Za-z0-9_.-]+',log,re.I)
        (caseout/'native-test.txt').write_text(log)
manifest={str(f.relative_to(OUT)):hashlib.sha256(f.read_bytes()).hexdigest() for f in OUT.rglob('*') if f.is_file()}
(OUT/'sha256.json').write_text(json.dumps(manifest,indent=2,sort_keys=True)+'\n')
print(json.dumps({'exportedFiles':len(manifest),'output':str(OUT)}))
