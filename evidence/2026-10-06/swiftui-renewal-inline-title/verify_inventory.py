#!/usr/bin/env python3
"""Verify immutable renewal inline-title rendering evidence; never invoke API/UI."""
import hashlib,io,json,re,subprocess,tarfile
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
RUN=HERE/'inline-title'
SOURCE='6997138485f3f8088fc03682432de74879e19659'
UI_SOURCE='310524b183cf48810e1447196fa7dab38509a6bc'
ALEX='791f7261-6c9d-4061-9c8a-57aa6e0b0200'
SAM='e5f80cfd-b69a-4aa0-a267-75784e943676'
HH='be772ffd-3ab5-41d5-8438-647a79a553da'
OP='f23e5dfb-cc10-4199-a0f1-bc2cfcbd521c'
REV='f736854d-935a-4433-ba0c-13a4b5e51ac6'

def read(path):
    return json.loads(path.read_text())

def digest(data):
    return hashlib.sha256(data).hexdigest()

def verify_inventory():
    expected = read(HERE / 'sha256.json')
    files = {str(p.relative_to(HERE)) for p in HERE.rglob('*') if p.is_file() and p.name != 'sha256.json'}
    assert files == set(expected)
    tracked = set(subprocess.check_output(['git', 'ls-files'], cwd=ROOT, text=True).splitlines())
    assert {str((HERE / name).relative_to(ROOT)) for name in files | {'sha256.json'}} <= tracked
    for name, value in expected.items():
        path = HERE / name
        assert digest(path.read_bytes()) == value, name
        if path.suffix == '.png':
            continue
        text = path.read_text()
        assert not re.search(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.', text), name
        assert not re.search(r'Bearer\s+[A-Za-z0-9_.-]+', text, re.I), name
        assert not re.search(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----', text), name
    for manifest in HERE.rglob('manifest.json'):
        for test in read(manifest):
            for item in test['attachments']:
                assert (manifest.parent / item['exportedFileName']).is_file()
    return len(files) + 1

def verify_request():
    saved = read(RUN / 'captured-reminder-request.json')
    command = saved['command']
    receipt = saved['result']['receipt']
    assert command['operationId'].lower() == OP and saved['result']['status'] == 'recorded'
    assert 'expectedRevision' in command and command['expectedRevision'] is None
    assert command['expectedRuleRevision'].lower() == '528417a1-b97a-4be4-9e63-ad7c8c03c2be'
    assert command['expectedDueOn'] == '2026-11-01' and not saved['cancellationRequested']
    settings = command['settings']
    assert settings['enabled'] and settings['localTime'] == '09:00' and settings['daysBefore'] == 1
    assert sorted(a.lower() for a in settings['recipientIds']) == sorted([ALEX, SAM])
    assert receipt['command'] == command and receipt['reminder']['settings'] == settings
    assert receipt['reminder']['revision'].lower() == REV
    for value in [saved['result'], receipt]:
        assert value['actorId'].lower() == ALEX and value['householdId'].lower() == HH
        assert value['operationId'].lower() == OP
    return saved

def verify_reads(saved):
    baseline = read(RUN / 'baseline.json')
    references = read(RUN / 'references.json')
    assert len(baseline['originalRules']) == 7
    assert sorted(r['status'] for r in baseline['originalRules']) == ['cancelled'] * 3 + ['paused'] * 4
    assert sum(len(p['rules']) for p in baseline['allRulePages']) == 8
    history = baseline['historyPages']
    assert history[-1].get('next') is None and sum(len(p['events']) for p in history) == 62
    assert baseline['knownRemovedRenewalHistory'] == references['knownRemovedHistory']
    rows = [read(p) for p in RUN.glob('*/native-read.json')]
    assert len(rows) == 4
    for row in rows:
        assert row['canonical'] == baseline and row['historyComplete'] and row['historyEventCount'] == 62
        assert row['hostedCommands'] == 0 and row['rule'] == references['ownedRule']
        assert row['household'].lower() == HH and row['actor'].lower() in [ALEX, SAM]
        owner = row['actor'].lower() == ALEX
        original = row['originalRuleRecovery']
        if owner:
            assert original == references['originalRequest']['result']
        else:
            assert original['status'] == 'unresolved' and original.get('receipt') is None
        if row['phase'] == 'before':
            assert row['reminder'].get('reminder') is None
            continue
        assert row['reminder']['reminder'] == saved['result']['receipt']['reminder']
        recovery = row['reminderOperationRecovery']
        if owner:
            assert recovery == saved['result']
        else:
            assert recovery['status'] == 'unresolved' and recovery.get('receipt') is None
            assert recovery['operationId'].lower() == OP and recovery['actorId'].lower() == SAM


def verify_map(commit,filename,count):
 values=read(filename);assert len(values)==count
 raw=subprocess.check_output(['git','archive',commit,'apps/ios'],cwd=ROOT)
 with tarfile.open(fileobj=io.BytesIO(raw)) as archive:
  for name,value in values.items():assert digest(archive.extractfile('apps/ios/'+name).read())==value,name


def verify_sources():
 verify_map(SOURCE,RUN/'sdk-source-input-hashes.json',1122)
 verify_map(UI_SOURCE,RUN/'source-input-hashes.json',1123)
 prior=ROOT/'evidence/2026-10-06/swiftui-native-recurring-reminder-save/recorded-save'
 assert read(RUN/'Nest-build-attestation.json')==read(prior/'Nest-build-attestation.json')
 attested=read(RUN/'NestAccessibility-build-attestation.json')
 assert attested['freshDirectoryRequired'] and len(attested['binarySha256'])>=3
 assert 'RenewalNavigationTests.swift' in str(attested['ownedSourceCompileLines'])
 assert attested['resolvedProductPaths']['NestAccessibilityTests']
 pin=read(RUN/'source-pinning.json')
 assert pin['UIExecutedSource']==UI_SOURCE and pin['SDKExecutedSource']==SOURCE
 assert pin['UIInputs']==1123 and pin['SDKInputs']==1122
 assert pin['SaveInvocations']==pin['DoneInvocations']==0
 original=read(HERE/'retained-title-observation.json')
 assert digest((ROOT/original['repositoryPath']).read_bytes())==original['sha256']
 assert digest((HERE/'retained-clipped-title.png').read_bytes())==original['sha256']


def verify_methods_and_frames():
 rows=read(RUN/'results.json');assert len(rows)==6
 assert all([r['exitCode'],r['passed'],r['failed'],r['skipped']]==[0,1,0,0] for r in rows)
 ui=[r for r in rows if r['method']=='RenewalNavigationTests/testUntouchedRenewalCancelRemainsReadable']
 assert len(ui)==2 and {r['step'] for r in ui}=={'normal_light','maximum_dark'}
 for folder in ['normal_light','maximum_dark']:
  samples=[]
  for path in (RUN/folder).glob('*.json'):
   value=read(path)
   if isinstance(value,list) and value and isinstance(value[0],dict) and value[0].get('label')=='Cancel':samples.extend(value)
  assert samples
  for value in samples:
   assert value['enabled'] and value['frame'][2]>=44-1e-9 and value['frame'][3]>=44-1e-9
 visual=read(HERE/'rendered-title-check.json')
 assert visual['normalTitle']=='New renewal' and visual['maximumTitle']=='New renewal'
 assert visual['normalCompleteWithoutEllipsis'] and visual['maximumCompleteWithoutEllipsis']
 assert visual['directRenderedInspection'] and not visual['AXLabelAlone']


def verify_restoration_and_reviews():
 value=read(RUN/'restoration.json');assert value['before']==value['after']
 assert all(value[k] for k in ['all64Empty','originalScopesUnchanged','initialUISettingsRestored','foregroundLaunchAfterTests','ownedPlansRemoved','scopedCaffeinateStopped'])
 assert all(v=={'appearance':'light','content_size':'large'} for v in read(RUN/'initial-ui-settings.json').values())
 terminal=read(RUN/'terminal.json')
 assert terminal['NormalUntouchedCancelPassed'] and terminal['MaximumUntouchedCancelPassed'] and terminal['BothFinalReadsPassed']
 assert terminal['SaveInvocations']==terminal['DoneInvocations']==0 and terminal['NoEditedDraftOrCensus']
 reviews=read(HERE/'visual-review.json')
 assert set(reviews)=={str(p.relative_to(HERE)) for p in HERE.rglob('*.png')}
 for name,value in reviews.items():
  assert value['reviewed'] and value['safeFictionalScope'] and value['sha256']==digest((HERE/name).read_bytes())


if __name__=='__main__':
 count=verify_inventory();verify_sources();verify_reads(verify_request());verify_methods_and_frames();verify_restoration_and_reviews()
 print(json.dumps({'passed':True,'files':count,'UIInputs':1123,'SDKInputs':1122,'nativeMethodsPassed':6,'nativeMethodsFailed':0}))
