from pathlib import Path
import json,re,shutil,subprocess
OUT=Path('/private/tmp/nest-post-rls-receipt-public-20261006')
OUT.mkdir(mode=0o700,exist_ok=True)
BATCHES={'post-rls-read':'nest-post-rls-receipt-reads-20261006'}

def safe(data):
 text=data.decode()
 assert not re.search(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.',text)
 assert not re.search(r'Bearer\s+[A-Za-z0-9_.-]+',text,re.I)
 assert not re.search(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',text)
for name,private in BATCHES.items():
 source=Path('/private/tmp')/private
 target=OUT/name;target.mkdir(exist_ok=True)
 completed={r['step'] for r in json.loads((source/'results.json').read_text())}
 for file in source.iterdir():
  if file.is_file() and file.suffix in {'.json','.png'}:
   if file.suffix!='.png':safe(file.read_bytes())
   shutil.copy2(file,target/file.name)
 for case in source.iterdir():
  if not case.is_dir() or case.name not in completed or not (case/'result.xcresult').exists():continue
  dest=target/case.name;dest.mkdir(exist_ok=True)
  summary=json.loads(subprocess.check_output(['xcrun','xcresulttool','get','test-results','summary','--path',str(case/'result.xcresult')],text=True))
  (dest/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
  log=(case/'test.log').read_bytes();safe(log)
  (dest/'native-test.txt').write_text('\n'.join(line.rstrip() for line in log.decode().splitlines())+'\n')
  if (case/'native-read.json').exists():
   safe((case/'native-read.json').read_bytes());shutil.copy2(case/'native-read.json',dest/'native-read.json')
  attachments=case/'attachments'
  if not (attachments/'manifest.json').exists():
   subprocess.run(['xcrun','xcresulttool','export','attachments','--path',str(case/'result.xcresult'),'--output-path',str(attachments)],check=True,capture_output=True)
  manifest=json.loads((attachments/'manifest.json').read_text());omitted=[]
  for test in manifest:
   included=[]
   for a in test['attachments']:
    file=attachments/a['exportedFileName']
    if file.suffix in {'.json','.txt','.png'}:
     if file.suffix!='.png':safe(file.read_bytes())
     shutil.copy2(file,dest/file.name);included.append(a)
    else:omitted.append({'name':a['suggestedHumanReadableName'],'retainedPrivately':True})
   test['attachments']=included
  (dest/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
  (dest/'private-attachments.json').write_text(json.dumps(omitted,indent=2)+'\n')
print(json.dumps({'files':sum(p.is_file() for p in OUT.rglob('*')),'PNGs':len(list(OUT.rglob('*.png'))),'output':str(OUT)}))
