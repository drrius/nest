#!/usr/bin/env python3
import argparse,gzip,hashlib,io,json,re,subprocess,tarfile
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[4]
SOURCE='587a2349de1ed7c1ddf4d8c619c51dd8db683529'
def read(name):return json.loads((HERE/name).read_text())
def digest(data):return hashlib.sha256(data).hexdigest()
parser=argparse.ArgumentParser();parser.add_argument('--allow-untracked-precommit',action='store_true');args=parser.parse_args()
files={str(p.relative_to(HERE)) for p in HERE.rglob('*') if p.is_file() and p.name!='sha256.json'}
assert files==set(read('sha256.json'))
if not args.allow_untracked_precommit:
 tracked=set(subprocess.check_output(['git','ls-files'],cwd=ROOT,text=True).splitlines())
 assert {str((HERE/n).relative_to(ROOT)) for n in files|{'sha256.json'}}<=tracked
for n,h in read('sha256.json').items():
 data=(HERE/n).read_bytes();assert digest(data)==h
 if n.endswith('.gz'):data=gzip.decompress(data)
 if not n.endswith('.png'):
  text=data.decode();assert not re.search(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.',text)
  assert not re.search(r'Bearer\s+[A-Za-z0-9_.-]+',text,re.I)
values=read('source-input-hashes.json');assert len(values)==1129
with tarfile.open(fileobj=io.BytesIO(subprocess.check_output(['git','archive',SOURCE,'apps/ios'],cwd=ROOT))) as archive:
 for n,h in values.items():assert digest(archive.extractfile('apps/ios/'+n).read())==h,n
attested=read('Nest-build-attestation.json');assert len(attested['binarySha256'])==3 and attested['freshDirectoryRequired']
assert attested['resolvedProductPaths']['NestAppTests']
for n in ['HostedChoreHistoryAuthDiagnosticTests.swift','NestAuth.swift','NestHTTP.swift','ChoreAPI.swift']:assert n in str(attested['ownedSourceCompileLines'])
trace=read('diagnostic-observation.json');assert trace['diagnosticFinished'] and trace['nativeMembershipVerified'] and trace['sessionExpectedActorMatches']
assert not trace['old9410CauseEstablishedByThisDiagnostic'] and not trace['tokenHeadersProviderBodiesOrCredentialsExported']
assert [(r['method'],r['path'],r['status'],r['contentMediaType']) for r in trace['requests']]==[('GET','/v1/session',200,'application/json')]
result=read('diagnostic-results.json');assert [result[k] for k in ['exitCode','passed','failed','skipped']]==[0,1,0,0] and result['seconds']==4.954
terminal=read('diagnostic-terminal.json');assert terminal['Source']==SOURCE and terminal['NativeInputs']==1129
assert terminal['DiagnosticInvocationAttempts']==1 and all(terminal[k] for k in ['DiagnosticBudgetConsumed','SummaryRecorded','ObservationRecorded','DiagnosticMethodPassed','NativeMembershipVerified','RestorationStateChecksPassed'])
assert not terminal['UIInvoked'] and not terminal['Old9410CauseProven'] and terminal['DomainMutationBudget']==0
restored=read('diagnostic-restoration.json');assert restored['before']==restored['after']
assert all(restored[k] for k in ['all64Empty','originalScopesUnchanged','initialUISettingsRestored','localViewSemanticsUnchanged'])
assert read('diagnostic-local-view-before.json')==read('diagnostic-local-view-after.json')
assert all(v=={'appearance':'light','content_size':'large'} for v in read('initial-ui-settings.json').values())
cleanup=read('diagnostic-post-terminal-cleanup-confirmed.json');assert all(cleanup[k] for k in ['CheckedAfterTerminal','selectedPrivatePlansAbsent','scopedCaffeinateAbsent'])
for n,v in read('visual-review.json').items():assert v['directlyReviewed'] and v['TodayMeSharedVisible'] and digest((HERE/n).read_bytes())==v['sha256']
raw=gzip.decompress((HERE/'diagnostic-alex/native-test.txt.gz').read_bytes());assert digest(raw)==read('diagnostic-alex/raw-log-hash.json')['decodedRawSHA256']
assert b'passed (2.152 seconds)' in raw
print(json.dumps({'passed':True,'files':len(files)+1,'source':SOURCE,'inputs':1129,'diagnosticPass':1,'nativeMembershipVerified':True,'old9410CauseKnown':False,'UIInvoked':False}))
