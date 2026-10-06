#!/usr/bin/env python3
"""Verify source-pinned finite-geometry maximum navigation evidence; no native/API/SQL invocation."""
import argparse,hashlib,io,json,math,re,subprocess,tarfile
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[4]
RUN=HERE/'typed-run'
SDK='6997138485f3f8088fc03682432de74879e19659'
UI='345c82e402dc80787041a1583005f244093e5b86'
ALEX='791f7261-6c9d-4061-9c8a-57aa6e0b0200'
SAM='e5f80cfd-b69a-4aa0-a267-75784e943676'
HH='be772ffd-3ab5-41d5-8438-647a79a553da'
OP='f23e5dfb-cc10-4199-a0f1-bc2cfcbd521c'
REV='f736854d-935a-4433-ba0c-13a4b5e51ac6'


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
 verify_map(UI,RUN/'source-input-hashes.json',1127)
 verify_map(SDK,RUN/'sdk-source-input-hashes.json',1122)
 prior=ROOT/'evidence/2026-10-06/swiftui-native-recurring-reminder-save/recorded-save'
 for name in ['Nest-build-attestation.json','baseline.json','references.json','captured-reminder-request.json']:
  assert read(RUN/name)==read(prior/name)
 attested=read(RUN/'NestAccessibility-build-attestation.json')
 assert attested['freshDirectoryRequired'] and len(attested['binarySha256'])==3
 assert attested['resolvedProductPaths']['NestAccessibilityTests']
 for name in ['AssistantFinancialHistoryLinkTests.swift','AssistantFinancialHistoryMaximumReading.swift','FinancialApprovalRow.swift']:
  assert name in str(attested['ownedSourceCompileLines'])
 for name,value in read(HERE/'executed-controller-hashes.json').items():
  assert digest((HERE/'controllers'/name).read_bytes())==value
 pin=read(RUN/'source-pinning.json')
 assert pin['UIExecutedSource']==UI and pin['SDKExecutedSource']==SDK
 assert pin['UIInputs']==1127 and pin['SDKInputs']==1122
 prepared=read(RUN/'prepared.json')
 assert prepared['Prepared'] and prepared['NoSDKOrUIExecuted'] and prepared['Source']==UI
 old=HERE.parents[1]/'native/verify_inventory.py'
 subprocess.run(['python3',str(old)],check=True,capture_output=True)
 readiness=read(HERE.parent/'type-boundary-correction/readiness.json')
 assert readiness['sourceHash']==read(RUN/'source-input-hashes.json')['UITests/AssistantFinancialHistoryMaximumReading.swift']


def methods():
 rows=read(RUN/'results.json')
 assert len(rows)==5 and all([r['exitCode'],r['passed'],r['failed'],r['skipped']]==[0,1,0,0] for r in rows)
 ui=next(r for r in rows if r['step']=='financial-history-maximum')
 assert ui['method']=='AssistantFinancialHistoryLinkTests/testMaximumRecordedBillNavigationWithFiniteGeometry'
 assert ui['seconds']==423.698
 terminal=read(RUN/'terminal.json')
 assert terminal['DiagnosticControllerComplete'] and terminal['BothFinalReadsPassed']
 assert terminal['UIInvocationAttempts']==1 and terminal['UIInvocationAttempted']
 assert terminal['UIBudgetConsumed'] and terminal['UISummaryRecorded'] and terminal['UIResult']==ui
 assert terminal['MaximumOnly'] and not terminal['NormalReplayed'] and terminal['NoRepeatedUI']
 assert terminal['UIDomainMutationBudget']==terminal['LiveModelInvocations']==0
 assert terminal['SDKAuthSetupMayPOSTLogin'] and not terminal['WirePOSTCountMeasured']
 marker=read(RUN/'financial-history-maximum-ui-invocation-consumed.json')
 assert marker['ConsumedBeforeInvocation'] and marker['MaximumUIBudgetConsumed'] and marker['NormalUIReplays']==0 and marker['Source']==UI
 assert read(RUN/'execution-invocation-consumed.json')['ConsumedBeforeAnySDKOrUIInvocation']
 assert read(RUN/'actual-maximum-settings-before-ui.json')=={'appearance':'dark','content_size':'accessibility-extra-extra-extra-large'}
 log=(RUN/'financial-history-maximum/native-test.txt').read_text()
 assert 'passed (421.798 seconds)' in log


def geometry():
 folder=RUN/'financial-history-maximum'
 proof=read(HERE/'geometry-review.json')
 assert proof['panCount']==37 and proof['allPanGeometryValidated']
 assert not proof['oldInfiniteComponentAttributionKnown'] and proof['rawNonfiniteDiagnosticCount']==0
 assert proof['unrealizedAbsentTargetPanCount']==12
 assert not proof['continuousTallStaticTextBranchObserved']
 targets={p['label']:p for p in proof['measuredTargetsAndFields']}
 for label in ['Conversation, Oct 5, 2026 at 12:42\u202fAM','Record recurring bill, Expires Oct 5, 2026 at 12:57\u202fAM','View recorded expense']:
  target=targets[label]
  assert read(folder/target['attachment'])=={k:v for k,v in target.items() if k not in ['attachment','wholeViewportAtSnapshot','restorationOnlySnapshot']}
  f=target['frame'];v=target['observedViewport']
  assert target['enabled'] and target['hittable'] and target['exists'] and target['wholeViewportAtSnapshot']
  assert f['width']>=44 and f['height']>=44
  assert f['minX']>=v['minX'] and f['maxX']<=v['maxX'] and f['minY']>=v['minY'] and f['maxY']<=v['maxY']
 for item in proof['pans']:
  pan=read(folder/item['attachment']);viewport=pan['viewport'];scroller=pan['scroller']
  for frame in [viewport,scroller]:
   assert frame['usable'] and not frame['isNull'] and not frame['isInfinite']
   assert all(type(frame[k]) in [int,float] and math.isfinite(frame[k]) for k in ['minX','minY','maxX','maxY','midX','midY','width','height'])
  x=pan['start'][0];assert x==pan['end'][0] and x in [12,24] and pan['attempt']<24
  for point in [pan['start'],pan['end']]:
   assert all(math.isfinite(n) for n in point)
   for frame in [viewport,scroller]:assert frame['minX']<=point[0]<=frame['maxX'] and frame['minY']<=point[1]<=frame['maxY']
  for bar in pan['scrollBars']:assert not bar['minX']<=x<=bar['maxX']
  for action in pan['actionRegions']:assert x<action['minX']
 outcome=read(HERE/'outcome.json')
 assert all(outcome[k] for k in ['canonicalBillFieldsVerified','entryDetailsVisited','wholeMaximumJourneyPassed'])
 assert not outcome['normalReplayed'] and not outcome['oldInfiniteComponentKnown']


def metadata():
 proof=read(RUN/'financial-fixture-validated-before.json');event=proof['event']
 assert type(event['amountCentimes']) is str and event['amountCentimes']=='3'
 assert event['eventId'].lower()=='96562f14-7500-4c47-80bf-487705ca02a2'
 assert proof['SDKSummaryVerified'] and not proof['SDKAllocationFieldsAvailable']
 assert proof['SeparateRootReadOnlyAllocationsVerified'] and not proof['authorizationProofFromPrivilegedMetadata']
 for name,value in read(HERE/'external-metadata-hashes.json').items():assert digest((HERE.parent/name).read_bytes())==value
 transient={'checkedAtUTC','checkedAfterActualTerminal','executionSession','unchangedFromBefore'}
 for purpose in ['fixture','allocation']:
  before=read(HERE.parent/(purpose+'-metadata-before-345c82.json'))
  after=read(HERE.parent/(purpose+'-metadata-after-345c82.json'))
  assert after['unchangedFromBefore'] and after['checkedAfterActualTerminal']
  assert {k:v for k,v in before.items() if k not in transient}=={k:v for k,v in after.items() if k not in transient}
  assert before['readOnlyPrivilegedMetadata'] and not before['authorizationProof']
 allocations=read(HERE.parent/'allocation-metadata-before-345c82.json')
 assert type(allocations['amount_cents']) is int and allocations['amount_cents']==3 and allocations['notPartOfSDKHistoryDTO']
 assert {v['member_id']:v['allocated_cents'] for v in allocations['allocations']}=={ALEX:2,SAM:1}
 assert {v['member_id']:v['receivable_delta_cents'] for v in allocations['ledger']}=={ALEX:1,SAM:-1}
 review=read(HERE.parent/'root-review-345c82.json')
 assert review['sourceCommit']==UI and review['PNGfilesReviewed']==8 and review['distinctPNGContents']==7
 assert review['rootIndependentPanChecks']==37 and review['allThreeLinksFullyVisibleEnabledHittableAtLeast44']
 assert not any(review[k] for k in ['tallContinuousReadingBranchExecuted','maximumMeSharedSnapshotFullyVisible','oldInfiniteComponentAttributionKnown','normalJourneyReplayed','fullAccessibilityAuditClosed','phoneVerified'])
 ci=read(HERE.parent/'source-ci-345c82.json')
 assert ci['sourceCommit']==UI and ci['native']['conclusion']==ci['routine']['conclusion']=='success'
 assert not ci['native']['hostedUIExecutedByCI']


def restoration_and_reviews():
 assert read(RUN/'local-view-before.json')==read(RUN/'local-view-final.json')
 restoration=read(RUN/'restoration.json');assert restoration['before']==restoration['after']
 assert all(restoration[k] for k in ['all64Empty','originalScopesUnchanged','initialUISettingsRestored','foregroundLaunchAfterTests','localViewSemanticsUnchanged','ownedPlansRemoved','scopedCaffeinateStopped'])
 for state in restoration['after'].values():assert state['emptyJournals']==64 and not state['ownedReminderRequest'] and state['household']==HH and state['actor'] in [ALEX,SAM]
 for phase in ['before-ui','final-foreground']:
  proof=read(RUN/(phase+'-scope-settled.json'));assert proof['twoContiguousMatchingSamples'] and proof['originalActorsHousehold64']
 cleanup=read(RUN/'post-terminal-cleanup-confirmed.json')
 assert cleanup['CheckedAfterTerminal'] and cleanup['selectedPrivatePlansAbsent'] and cleanup['scopedCaffeinateAbsent']
 assert all(v=={'appearance':'light','content_size':'large'} for v in read(RUN/'initial-ui-settings.json').values())
 reviews=read(HERE/'visual-review.json')
 assert len(reviews)==8 and set(reviews)=={str(p.relative_to(HERE)) for p in HERE.rglob('*.png')}
 for name,value in reviews.items():assert value['reviewed'] and value['safeFictionalScope'] and value['sha256']==digest((HERE/name).read_bytes())


if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--allow-untracked-precommit',action='store_true');args=parser.parse_args()
 count=inventory(not args.allow_untracked_precommit)
 sources();reads();methods();geometry();metadata();restoration_and_reviews()
 print(json.dumps({'passed':True,'files':count,'UIInputs':1127,'SDKInputs':1122,'nativePasses':5,'nativeFailures':0,'wholeMaximumJourneyPassed':True,'earlierFailurePackageVerified':True,'trackedInventoryRequired':not args.allow_untracked_precommit}))
