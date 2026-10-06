from pathlib import Path
import json,re,shutil,subprocess
SOURCE=Path('/private/tmp/nest-contrast-viewport-20261006')
OUT=Path('/private/tmp/nest-contrast-viewport-public-20261006')
OUT.mkdir(mode=0o700,exist_ok=True)
assert json.loads((SOURCE/'terminal.json').read_text())['requestedDiagnosticExecuted']
for name in ['results.json','restoration.json','terminal.json','source-input-hashes.json','restored-today.png']:
    shutil.copy2(SOURCE/name,OUT/name)
summary=json.loads(subprocess.check_output(['xcrun','xcresulttool','get','test-results','summary','--path',str(SOURCE/'alex/result.xcresult')],text=True))
(OUT/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
log=(SOURCE/'alex/test.log').read_text()
assert not re.search(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.',log)
assert not re.search(r'Bearer\s+[A-Za-z0-9_.-]+',log,re.I)
(OUT/'native-test.txt').write_text('\n'.join(s.rstrip() for s in log.splitlines())+'\n')
manifest=json.loads((SOURCE/'alex/attachments/manifest.json').read_text())
omitted=[]
for case in manifest:
    safe=[]
    for attachment in case['attachments']:
        file=SOURCE/'alex/attachments'/attachment['exportedFileName']
        if file.suffix in {'.png','.txt','.json'}:
            shutil.copy2(file,OUT/file.name);safe.append(attachment)
        else:omitted.append({'name':attachment['suggestedHumanReadableName'],'retainedPrivately':True})
    case['attachments']=safe
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(OUT/'private-attachments.json').write_text(json.dumps(omitted,indent=2)+'\n')
print(json.dumps({'safeExportFiles':len([p for p in OUT.rglob('*') if p.is_file()]),'output':str(OUT)}))
