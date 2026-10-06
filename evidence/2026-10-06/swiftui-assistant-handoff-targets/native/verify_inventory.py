#!/usr/bin/env python3
"""Verify immutable first-phase synthetic native handoff evidence; no API/UI/SQL execution."""
import argparse,hashlib,io,json,re,subprocess,tarfile
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[3]
RUN=HERE/'native-run'
SDK='6997138485f3f8088fc03682432de74879e19659'
UI='dff8d993c224936b869ae16c937989ea3d8677a5'
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
 verify_map(UI,RUN/'source-input-hashes.json',1125)
 verify_map(SDK,RUN/'sdk-source-input-hashes.json',1122)
 prior=ROOT/'evidence/2026-10-06/swiftui-native-recurring-reminder-save/recorded-save'
 for name in ['Nest-build-attestation.json','baseline.json','references.json','captured-reminder-request.json']:
  assert read(RUN/name)==read(prior/name)
 attested=read(RUN/'NestAccessibility-build-attestation.json')
 assert attested['freshDirectoryRequired'] and len(attested['binarySha256'])>=3
 assert attested['resolvedProductPaths']['NestAccessibilityTests']
 for name in ['AssistantHandoffLinkTests.swift','AssistantHandoffRow.swift','AssistantHistoryScreen.swift',
              'AssistantLegacyRecurringRow.swift','AssistantRenewalRow.swift','AssistantSummaryRow.swift']:
  assert name in str(attested['ownedSourceCompileLines'])
 for name,value in read(HERE/'executed-controller-hashes.json').items():
  assert digest((HERE/'controllers'/name).read_bytes())==value
 pin=read(RUN/'source-pinning.json')
 assert pin['UIExecutedSource']==UI and pin['SDKExecutedSource']==SDK
 assert pin['UIInputs']==1125 and pin['SDKInputs']==1122
 assert read(RUN/'prepared.json')['NoSDKOrUIExecuted']


def methods():
 rows=read(RUN/'results.json');assert len(rows)==6
 passed=[row for row in rows if row['passed']==1 and row['failed']==0 and row['exitCode']==0]
 failed=[row for row in rows if row['failed']==1 and row['passed']==0 and row['exitCode']!=0]
 assert len(passed)==5 and len(failed)==1 and failed[0]['step']=='maximum-dark'
 assert next(row for row in passed if row['step']=='normal-light')['seconds']==82.145
 assert failed[0]['seconds']==111.922
 value=read(RUN/'terminal.json')
 assert not value['BothUIProfilesPassed'] and value['BothFinalReadsPassed']
 assert value['UIDomainMutationBudget']==value['LiveModelInvocations']==0
 assert not value['WirePOSTCountMeasured'] and value['SDKAuthSetupMayPOSTLogin']
 assert read(RUN/'baseline-prepared.json')['NoUIInvoked']


def branch_records(folder):
 captures=[];opened=[];omitted=[]
 for path in folder.glob('*.json'):
  value=read(path)
  if not isinstance(value,dict):continue
  if value.get('label') in LABELS and 'hittable' in value:captures.append(value)
  if 'opened' in value:
   (opened if value['opened'] else omitted).append(value['link'])
 return captures,opened,omitted


def verify_frames(captures):
 for value in captures:
  assert value['exists'] and value['enabled'] and value['hittable']
  x,y,w,h=value['frame'];vx,vy,vw,vh=value['viewport']
  assert w>=44-1e-9 and h>=44-1e-9
  assert x>=vx and y>=vy and x+w<=vx+vw and y+h<=vy+vh


def branches():
 normal,opened,omitted=branch_records(RUN/'normal-light')
 assert len(normal)==6 and set(opened)==LABELS and not omitted
 assert all(value['frame'][2:]==[303,58] for value in normal)
 verify_frames(normal)
 maximum,opened,omitted=branch_records(RUN/'maximum-dark')
 assert len(maximum)==3 and set(v['label'] for v in maximum)=={'Open Calendar','Review busy sharing','Review ingredients'}
 assert opened==['Open Calendar'] and omitted==['Review busy sharing']
 assert all(value['frame'][2:]==[303,119] for value in maximum)
 verify_frames(maximum)
 failure=read(RUN/'maximum-dark/8E75B285-E970-44A1-A2A8-7BDCEAC68B7E.json')
 assert failure['frame']==[16,44,343,589.5] and failure['viewport']==[0,74,375,510]
 assert failure['frame'][3]>failure['viewport'][3]


def local_state_and_restoration():
 first=read(RUN/'local-view-before.json');last=read(RUN/'local-view-final.json');assert first==last
 for profile in ['normal-light','maximum-dark']:
  assert read(RUN/(profile+'-local-view-before.json'))==read(RUN/(profile+'-local-view-after.json'))==first
 for value in last.values():
  assert value['privacyJournalRows']=={'calendar_privacy_removals':0,'calendar_consent_changes':0}
 assert last['alex']['ingredientReview']['sequence']==9 and last['sam']['ingredientReview'] is None
 restore=read(RUN/'restoration.json');assert restore['before']==restore['after']
 assert all(restore[k] for k in ['all64Empty','originalScopesUnchanged','initialUISettingsRestored',
                                'foregroundLaunchAfterTests','ownedPlansRemoved','scopedCaffeinateStopped'])
 for phase in ['content_size','before-ui','final-foreground']:
  value=read(RUN/(phase+'-scope-settled.json'))
  assert value['twoContiguousMatchingSamples'] and value['originalActorsHousehold64']
 assert all(v=={'appearance':'light','content_size':'large'} for v in read(RUN/'initial-ui-settings.json').values())


def fixture_and_reviews():
 ready=read(RUN/'root-fixture-ready.json')
 assert ready['conversationId']=='4e809372-f12d-4004-afd3-9a502e98de23'
 assert ready['existingOwnerConsentDisabled'] and ready['fixtureInsertedAndVerified'] and not ready['modelTurnCreated']
 cleanup=read(HERE.parent/'fixture-cleanup-verified.json')
 assert cleanup['removedFixtureId']==ready['conversationId'] and cleanup['fixture_rows']==0
 assert cleanup['originalConversationsAndConsentAndBusySnapshotsExact']
 assert cleanup['original_conversations_md5']==ready['originalConversationsFingerprint']
 assert cleanup['consent'][0]['consent_md5']==ready['existingConsentFingerprint']
 assert cleanup['fixtureCreationBudgetConsumed']==cleanup['fixtureRemovalBudgetConsumed']==1
 reviews=read(HERE/'visual-review.json')
 assert len(reviews)==22 and set(reviews)=={str(p.relative_to(HERE)) for p in HERE.rglob('*.png')}
 for name,value in reviews.items():assert value['reviewed'] and value['safeFictionalScope'] and value['sha256']==digest((HERE/name).read_bytes())


if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--allow-untracked-precommit',action='store_true');args=parser.parse_args()
 count=inventory(not args.allow_untracked_precommit)
 sources();reads();methods();branches();local_state_and_restoration();fixture_and_reviews()
 print(json.dumps({'passed':True,'files':count,'UIInputs':1125,'SDKInputs':1122,'nativePasses':5,'retainedNativeFailures':1,
                   'trackedInventoryRequired':not args.allow_untracked_precommit}))
