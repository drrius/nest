from pathlib import Path
import json,re,subprocess
SOURCE=Path('/private/tmp/nest-grocery-reminder-baseline-20261006')
OUT=Path('/private/tmp/nest-grocery-reminder-observer-failure-public-20261006')
assert not OUT.exists();OUT.mkdir(mode=0o700)
summary=json.loads(subprocess.check_output(['xcrun','xcresulttool','get','test-results','summary','--path',str(SOURCE/'alex-before/result.xcresult')],text=True))
(OUT/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
for name in ['source-input-hashes.json','restoration.json','terminal.json']:(OUT/name).write_bytes((SOURCE/name).read_bytes())
log=(SOURCE/'alex-before/test.log').read_text()
assert not re.search(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.',log)
(OUT/'native-test.txt').write_text('\n'.join(l.rstrip() for l in log.splitlines())+'\n')
records=[]
for f in (SOURCE/'alex-before/attachments').glob('*.json'):
 v=json.loads(f.read_text())
 if isinstance(v,dict) and 'context' in v:records.append(v)
assert len(records)==1
(OUT/'actual-context.json').write_text(json.dumps(records[0],indent=2)+'\n')
print('Initial incorrect-name observer failure safely retained; no UI ran')
