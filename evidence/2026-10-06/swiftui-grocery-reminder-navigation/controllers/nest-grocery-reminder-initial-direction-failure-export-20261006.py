from pathlib import Path
import json,re,shutil,subprocess
SOURCE=Path('/private/tmp/nest-grocery-reminder-maximum-refresh-suffix-20261006')
OUT=Path('/private/tmp/nest-grocery-reminder-initial-direction-failure-public-20261006')
OUT.mkdir(mode=0o700,exist_ok=True)

for name in ['results.json','restoration.json','terminal.json','source-input-hashes.json','alex-restored-today.png','sam-restored-today.png','reused-real-before-contexts.json','sdk-frozen-source-input-hashes.json']:
    shutil.copy2(SOURCE/name,OUT/name)
for key in ['maximum_dark']:
    case=SOURCE/key;target=OUT/key;target.mkdir(exist_ok=True)
    summary=json.loads(subprocess.check_output(['xcrun','xcresulttool','get','test-results','summary','--path',str(case/'result.xcresult')],text=True))
    (target/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
    log=(case/'test.log').read_text()
    assert not re.search(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.',log)
    assert not re.search(r'Bearer\s+[A-Za-z0-9_.-]+',log,re.I)
    (target/'native-test.txt').write_text('\n'.join(s.rstrip() for s in log.splitlines())+'\n')
    if (case/'native-read.json').exists():shutil.copy2(case/'native-read.json',target/'native-read.json')
    manifest=json.loads((case/'attachments/manifest.json').read_text());omitted=[]
    for test in manifest:
        safe=[]
        for a in test['attachments']:
            file=case/'attachments'/a['exportedFileName']
            if file.suffix in {'.png','.txt','.json'}:shutil.copy2(file,target/file.name);safe.append(a)
            else:omitted.append({'name':a['suggestedHumanReadableName'],'retainedPrivately':True})
        test['attachments']=safe
    (target/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    (target/'private-attachments.json').write_text(json.dumps(omitted,indent=2)+'\n')
print(json.dumps({'safeExportFiles':len([f for f in OUT.rglob('*') if f.is_file()]),'output':str(OUT)}))
