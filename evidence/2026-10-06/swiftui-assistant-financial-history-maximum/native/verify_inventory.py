#!/usr/bin/env python3
"""Verify immutable failed maximum financial result-navigation evidence; no API/UI/SQL execution."""
import argparse,hashlib,io,json,re,subprocess,tarfile
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[3]
RUN=HERE/'native-run'
SDK='6997138485f3f8088fc03682432de74879e19659'
UI='0b670a538d66239a43a69a890b3e6abfa664c0c2'
ALEX='791f7261-6c9d-4061-9c8a-57aa6e0b0200'
SAM='e5f80cfd-b69a-4aa0-a267-75784e943676'
HH='be772ffd-3ab5-41d5-8438-647a79a553da'
OP='f23e5dfb-cc10-4199-a0f1-bc2cfcbd521c'
REV='f736854d-935a-4433-ba0c-13a4b5e51ac6'
LABELS={'Open Calendar','Review busy sharing','Review ingredients','Review notifications','Review your setup','Open Profile'}

def read(path):
    return json.loads(path.read_text())

def digest(data):
    return hashlib.sha256(data).hexdigest()

def verify_map(commit, path, count):
    values = read(path)
    assert len(values) == count
    raw = subprocess.check_output(['git', 'archive', commit, 'apps/ios'], cwd=ROOT)
    with tarfile.open(fileobj=io.BytesIO(raw)) as archive:
        for name, value in values.items():
            assert digest(archive.extractfile('apps/ios/' + name).read()) == value, name

def request():
    saved = read(RUN / 'captured-reminder-request.json')
    command = saved['command']
    receipt = saved['result']['receipt']
    assert command['operationId'].lower() == OP and saved['result']['status'] == 'recorded'
    assert command['expectedRevision'] is None and command['expectedDueOn'] == '2026-11-01'
    assert not saved['cancellationRequested']
    settings = command['settings']
    assert settings['enabled'] and settings['localTime'] == '09:00' and settings['daysBefore'] == 1
    assert sorted(a.lower() for a in settings['recipientIds']) == sorted([ALEX, SAM])
    assert receipt['command'] == command and receipt['reminder']['settings'] == settings
    assert receipt['reminder']['revision'].lower() == REV
    return saved

def verify_read(row, saved, baseline, references):
    assert row['canonical'] == baseline and row['historyComplete'] and row['historyEventCount'] == 62
    assert row['hostedCommands'] == 0 and row['rule'] == references['ownedRule']
    assert row['household'].lower() == HH and row['actor'].lower() in [ALEX, SAM]
    assert row['reminder']['reminder'] == saved['result']['receipt']['reminder']
    owner = row['actor'].lower() == ALEX
    for result, expected in [(row['originalRuleRecovery'], references['originalRequest']['result']),
                             (row['reminderOperationRecovery'], saved['result'])]:
        if owner:
            assert result == expected
        else:
            assert result['status'] == 'unresolved' and result.get('receipt') is None
            assert result['actorId'].lower() == SAM and result['householdId'].lower() == HH
            assert result['operationId'].lower() == expected['operationId'].lower()

def reads():
    baseline = read(RUN / 'baseline.json')
    references = read(RUN / 'references.json')
    assert len(baseline['originalRules']) == 7
    assert sorted(r['status'] for r in baseline['originalRules']) == ['cancelled'] * 3 + ['paused'] * 4
    assert sum(len(p['rules']) for p in baseline['allRulePages']) == 8
    pages = baseline['historyPages']
    assert pages[-1].get('next') is None and sum(len(p['events']) for p in pages) == 62
    assert baseline['knownRemovedRenewalHistory'] == references['knownRemovedHistory']
    rows = list(HERE.glob('*/**/native-read.json'))
    assert len(rows) == 4
    saved = request()
    for path in rows:
        verify_read(read(path), saved, baseline, references)

def inventory(require_tracked):
 expected=read(HERE/'sha256.json')
 files={str(p.relative_to(HERE)) for p in HERE.rglob('*') if p.is_file() and p.name!='sha256.json'}
 assert files==set(expected)
 if require_tracked:
  tracked=set(subprocess.check_output(['git','ls-files'],cwd=ROOT,text=True).splitlines())
  assert {str((HERE/name).relative_to(ROOT)) for name in files|{'sha256.json'}}<=tracked
 for name,value in expected.items():
  p=HERE/name;assert digest(p.read_bytes())==value,name
  if p.suffix=='.png':continue
  text=p.read_text()
  assert not re.search(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.',text),name
  assert not re.search(r'Bearer\s+[A-Za-z0-9_.-]+',text,re.I),name
  assert not re.search(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',text),name
 for manifest in HERE.rglob('manifest.json'):
  for test in read(manifest):
   for item in test['attachments']:assert (manifest.parent/item['exportedFileName']).is_file()
 return len(files)+1

def sources():
 verify_map(UI,RUN/'source-input-hashes.json',1127);verify_map(SDK,RUN/'sdk-source-input-hashes.json',1122)
 prior=ROOT/'evidence/2026-10-06/swiftui-native-recurring-reminder-save/recorded-save'
 for name in ['Nest-build-attestation.json','baseline.json','references.json','captured-reminder-request.json']:assert read(RUN/name)==read(prior/name)
 attested=read(RUN/'NestAccessibility-build-attestation.json')
 assert attested['freshDirectoryRequired'] and len(attested['binarySha256'])==3
 assert attested['resolvedProductPaths']['NestAccessibilityTests']
 for name in ['AssistantFinancialHistoryLinkTests.swift','AssistantFinancialHistoryMaximumReading.swift','FinancialApprovalRow.swift']:assert name in str(attested['ownedSourceCompileLines'])
 for name,value in read(HERE/'executed-controller-hashes.json').items():assert digest((HERE/'controllers'/name).read_bytes())==value
 pin=read(RUN/'source-pinning.json');assert pin['UIExecutedSource']==UI and pin['SDKExecutedSource']==SDK and pin['UIInputs']==1127 and pin['SDKInputs']==1122
 assert read(RUN/'prepared.json')['NoSDKOrUIExecuted']
 failure=read(HERE/'preparation-failure.json');assert failure['session']==41996 and failure['inheritedRuntimeExpectedInputs']==1126 and failure['expectedFrozenInputs']==1127
 assert failure['compiledNativeBuilds']==failure['nativeSDKMethods']==failure['nativeUIMethods']==0
 assert 'len(current)==1126' in (HERE/'controllers'/failure['preservedController'].split('/')[-1]).read_text()
 assert 'len(current)==1127' in (HERE/'controllers/nest-assistant-financial-history-maximum-count-guard-20261006.py').read_text()


def methods():
 rows=read(RUN/'results.json');assert len(rows)==5
 passed=[r for r in rows if r['passed']==1 and r['failed']==0 and r['exitCode']==0]
 failed=[r for r in rows if r['passed']==0 and r['failed']==1 and r['exitCode']==65]
 assert len(passed)==4 and len(failed)==1 and failed[0]['step']=='financial-history-maximum' and failed[0]['seconds']==188.795
 assert all(r['skipped']==0 for r in rows)
 value=read(RUN/'terminal.json');assert value['DiagnosticControllerComplete'] and value['BothFinalReadsPassed'] and value['UIInvocations']==1
 assert value['MaximumOnly'] and not value['NormalReplayed'] and value['NoRepeatedUI']
 assert value['UIDomainMutationBudget']==value['LiveModelInvocations']==0 and not value['LiveModelResponseClaim']
 assert value['SDKAuthSetupMayPOSTLogin'] and not value['WirePOSTCountMeasured']
 marker=read(RUN/'financial-history-maximum-ui-invocation-consumed.json');assert marker['ConsumedBeforeInvocation'] and marker['MaximumUIInvocations']==1 and marker['NormalUIReplays']==0 and marker['Source']==UI
 assert read(RUN/'execution-invocation-consumed.json')['ConsumedBeforeAnySDKOrUIInvocation']
 assert read(RUN/'actual-maximum-settings-before-ui.json')=={'appearance':'dark','content_size':'accessibility-extra-extra-extra-large'}


def partial_geometry_and_exception():
 folder=RUN/'financial-history-maximum'
 for name,expected in [('BF688D51-4D68-4283-817C-8B5491F67969.json',[16,208,343,262]),('6EBE5AE3-26E3-4273-986D-4E8C43F6C4B3.json',[36,265,303,283])]:
  value=read(folder/name);assert value['exists'] and value['enabled'] and value['hittable'] and value['frame']==expected and value['viewport']==[0,74,375,510]
  x,y,w,h=value['frame'];assert w>=44 and h>=44 and x>=0 and x+w<=375 and y>=74 and y+h<=584
 pans=[]
 for path in folder.glob('*.json'):
  value=read(path)
  if isinstance(value,dict) and 'actionRegions' in value:pans.append(value)
 assert len(pans)==15 and {p['navigation'] for p in pans}=={'Conversation','Private conversations'}
 for pan in pans:
  assert len(pan['scrollers'])==1 and pan['scrollers']==[[0,0,375,667]]
  x=pan['start'][0];assert x==pan['end'][0] and x in [12,24]
  assert pan['viewport']==[0,74,375,510]
  for point in [pan['start'],pan['end']]:assert 74<=point[1]<=584
  for left,top,w,h in pan['actionRegions']:assert x<left
  for left,top,w,h in pan['scrollBars']:assert not left<=x<=left+w
 issue=(folder/'9ABAA6EB-A7F7-4A58-B02D-51B08ACF8C78.txt').read_text()
 assert 'NSInvalidArgumentException' in issue and 'Invalid number value (infinite) in JSON write' in issue
 assert all(name in issue for name in ['V6attach','V3pan','V6reveal','V4read','assertMaximumRecordedBill'])
 outcome=read(HERE/'outcome.json');assert not any(outcome[k] for k in ['exactInfiniteComponentKnown','canonicalBillFieldsVerified','entryDetailsVisited','wholeMaximumJourneyPassed'])


def fixture_and_metadata():
 proof=read(RUN/'financial-fixture-validated-before.json');event=proof['event']
 assert type(event['amountCentimes']) is str and event['amountCentimes']=='3' and event['eventId'].lower()=='96562f14-7500-4c47-80bf-487705ca02a2'
 assert event['payerId'].lower()==ALEX and event['kind']=='expense' and event['occurredOn']=='2026-10-05'
 assert proof['SDKSummaryVerified'] and not proof['SDKAllocationFieldsAvailable'] and proof['SeparateRootReadOnlyAllocationsVerified'] and not proof['authorizationProofFromPrivilegedMetadata']
 for name,value in read(HERE/'external-metadata-hashes.json').items():assert digest((HERE.parent/name).read_bytes())==value
 for purpose in ['fixture','allocation']:
  before=read(HERE.parent/(purpose+'-metadata-before.json'));after=read(HERE.parent/(purpose+'-metadata-after.json'))
  assert after.pop('beforeAfterIdentical')
  comparable={k:v for k,v in before.items() if k not in ['newFixtureCreated','notPartOfSDKHistoryDTO']}
  assert after==comparable
  assert before['readOnlyPrivilegedMetadata'] and not before['authorizationProof']
 allocations=read(HERE.parent/'allocation-metadata-before.json')
 assert type(allocations['amount_cents']) is int and allocations['amount_cents']==3
 assert {v['member_id']:v['allocated_cents'] for v in allocations['allocations']}=={ALEX:2,SAM:1}
 assert {v['member_id']:v['receivable_delta_cents'] for v in allocations['ledger']}=={ALEX:1,SAM:-1}
 assert allocations['notPartOfSDKHistoryDTO']
 review=read(HERE.parent/'root-review.json');assert review['nativeSource']==UI and review['rootDirectScreenshotReviews']==4
 assert not any(review[k] for k in ['canonicalBillFieldsVerified','entryDetailsVisited','wholeMaximumJourneyPassed','exactInfiniteFrameComponentKnown'])


def restoration_and_reviews():
 assert read(RUN/'local-view-before.json')==read(RUN/'local-view-final.json')
 restoration=read(RUN/'restoration.json');assert restoration['before']==restoration['after']
 assert all(restoration[k] for k in ['all64Empty','originalScopesUnchanged','initialUISettingsRestored','foregroundLaunchAfterTests','localViewSemanticsUnchanged','ownedPlansRemoved','scopedCaffeinateStopped'])
 for phase in ['before-ui','final-foreground']:
  proof=read(RUN/(phase+'-scope-settled.json'));assert proof['twoContiguousMatchingSamples'] and proof['originalActorsHousehold64']
 cleanup=read(RUN/'post-terminal-cleanup-confirmed.json');assert cleanup['postTerminalIndependentObservation'] and not cleanup['ownedSelectedPlansRemaining'] and not cleanup['caffeinateProcesses'] and cleanup['caffeinateQueryExit']==1
 assert all(v=={'appearance':'light','content_size':'large'} for v in read(RUN/'initial-ui-settings.json').values())
 reviews=read(HERE/'visual-review.json');assert len(reviews)==4 and set(reviews)=={str(p.relative_to(HERE)) for p in HERE.rglob('*.png')}
 for name,value in reviews.items():assert value['reviewed'] and value['safeFictionalScope'] and value['sha256']==digest((HERE/name).read_bytes())


if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--allow-untracked-precommit',action='store_true');args=parser.parse_args()
 count=inventory(not args.allow_untracked_precommit)
 sources();reads();methods();partial_geometry_and_exception();fixture_and_metadata();restoration_and_reviews()
 print(json.dumps({'passed':True,'files':count,'UIInputs':1127,'SDKInputs':1122,'nativePasses':4,'retainedNativeFailures':1,'preBuildPreparationFailurePreserved':True,'wholeMaximumJourneyPassed':False,'trackedInventoryRequired':not args.allow_untracked_precommit}))
