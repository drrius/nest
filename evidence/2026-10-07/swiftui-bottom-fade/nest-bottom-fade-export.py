from pathlib import Path
import gzip,hashlib,json,re,shutil,subprocess,tarfile
out=Path('/private/tmp/nest-bottom-fade-public-20261007');out.mkdir(mode=0o700)
roots={'baseline':Path('/private/tmp/nest-bottom-fade-baseline-20261007'),'calendar':Path('/private/tmp/nest-bottom-fade-candidate-audit-20261007'),'other-roots':Path('/private/tmp/nest-bottom-fade-candidate-other-roots-20261007')}
for name,root in roots.items():
 dest=out/name;dest.mkdir()
 terminal=json.loads((root/'terminal.json').read_text());assert terminal['restorationPassed'] and terminal['unfiltered'] and terminal['positiveCommands']==0
 for filename in ['summary.json','terminal.json','products.json','invocation-consumed.json','alex-final.png','sam-final.png','final-scope-settled.json']:
  shutil.copy2(root/filename,dest/filename)
 raw=(root/'test.log').read_bytes();assert not re.search(rb'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.',raw)
 (dest/'test.log.gz').write_bytes(gzip.compress(raw,mtime=0))
 (dest/'raw-log-hash.json').write_text(json.dumps({'decodedSHA256':hashlib.sha256(raw).hexdigest()},indent=2)+'\n')
 attachments=root/'public-export-attachments'
 subprocess.run(['xcrun','xcresulttool','export','attachments','--path',str(root/'result.xcresult'),'--output-path',str(attachments)],check=True,capture_output=True)
 issues=[]
 manifest=json.loads((attachments/'manifest.json').read_text())
 for test in manifest:
  for a in test['attachments']:
   if a['suggestedHumanReadableName'].startswith('Accessibility issue'):
    issue=json.loads((attachments/a['exportedFileName']).read_text());issue['case']=test['testIdentifier'];issues.append(issue)
 for p in attachments.iterdir():
  if p.suffix in ['.json','.txt','.png']:shutil.copy2(p,dest/p.name)
 (dest/'issues.json').write_text(json.dumps(issues,indent=2)+'\n')
 prep=Path('/private/tmp/nest-native-bottom-fade-candidate-20261007')
for filename in ['prepared.json','products.json','source-inputs.json']:shutil.copy2(prep/filename,out/('candidate-'+filename))
shutil.copy2('/private/tmp/nest-native-leftovers-sheet-scope-inputs-20261007.json',out/'baseline-source-inputs.json')
with tarfile.open('/private/tmp/nest-bottom-fade-public-20261007.tar','w') as tar:
 for p in out.rglob('*'):
  if p.is_file():tar.add(p,arcname=str(p.relative_to(out)))
print('Unfiltered baseline/candidate records exported with restored state')
