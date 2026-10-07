from pathlib import Path
import gzip,hashlib,json,re,shutil,subprocess,tarfile
root=Path('/private/tmp/nest-native-setup-status-20261007')
out=root/'success-public'
out.mkdir(mode=0o700,exist_ok=True)
for name in ['prepared.json','products.json','sdk-products.json','source-inputs.json']:
 shutil.copy2(root/name,out/name)
for step in ['before-alex','before-sam','normal-alex','normal-sam','maximum-alex','maximum-sam','after-alex','after-sam']:
 origin=Path('/private/tmp/nest-native-setup-20261007') if step.startswith('before') else root
 source=origin/step
 if not (source/'terminal.json').exists(): continue
 terminal=json.loads((source/'terminal.json').read_text())
 assert terminal['methodPassed'] and terminal['restorationPassed']
 dest=out/step
 if dest.exists(): continue
 dest.mkdir()
 for name in ['summary.json','terminal.json','invocation-consumed.json','alex-final.png','sam-final.png']:
  shutil.copy2(source/name,dest/name)
 raw=(source/'test.log').read_bytes()
 assert not re.search(rb'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.',raw)
 (dest/'test.log.gz').write_bytes(gzip.compress(raw,mtime=0))
 (dest/'raw-log-hash.json').write_text(json.dumps({'decodedSHA256':hashlib.sha256(raw).hexdigest()},indent=2)+'\n')
 attachments=source/'success-export-attachments'
 subprocess.run(['xcrun','xcresulttool','export','attachments','--path',str(source/'result.xcresult'),'--output-path',str(attachments)],check=True,capture_output=True)
 for p in attachments.iterdir():
  if p.suffix in ['.json','.txt','.png']: shutil.copy2(p,dest/p.name)
with tarfile.open('/private/tmp/nest-setup-success-public-20261007.tar','w') as tar:
 for p in out.rglob('*'):
  if p.is_file(): tar.add(p,arcname=str(p.relative_to(out)))
print(json.dumps({'exportedMethods':sorted(p.name for p in out.iterdir() if p.is_dir())}))
