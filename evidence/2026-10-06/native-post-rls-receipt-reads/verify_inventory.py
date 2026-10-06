#!/usr/bin/env python3
"""Verify immutable post-RLS native receipt reads; never call API or native actions."""
import hashlib,io,json,re,subprocess,tarfile
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
RUN=HERE/'post-rls-read'
SOURCE='6997138485f3f8088fc03682432de74879e19659'
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
    assert len(rows) == 2
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


def verify_sdk():
 values=read(RUN/'source-input-hashes.json');assert len(values)==1122
 raw=subprocess.check_output(['git','archive',SOURCE,'apps/ios'],cwd=ROOT)
 with tarfile.open(fileobj=io.BytesIO(raw)) as archive:
  for name,value in values.items():assert digest(archive.extractfile('apps/ios/'+name).read())==value,name
 previous=ROOT/'evidence/2026-10-06/swiftui-native-recurring-reminder-save/recorded-save'
 for name in ['Nest-build-attestation.json','source-input-hashes.json','references.json','baseline.json','captured-reminder-request.json']:
  assert read(RUN/name)==read(previous/name),name
 attested=read(RUN/'Nest-build-attestation.json')
 assert 'HostedActiveRecurringReminderReceiptReadTests.swift' in str(attested['ownedSourceCompileLines'])
 assert len(attested['binarySha256'])==3 and attested['resolvedProductPaths']['NestAppTests']
 pin=read(RUN/'source-pinning.json')
 assert pin['ExecutedSDKSource']==SOURCE and pin['SDKProductHashesRevalidated']
 assert pin['SelectedPathsAndSigningOriginsVerified'] and pin['CurrentMirrorIsNotExecutedSource']
 assert pin['HostedRLSVersion']=='20261006161050' and pin['SaveInvocations']==0


def verify_outcomes():
 rows=read(RUN/'results.json')
 assert len(rows)==2 and all([r['exitCode'],r['passed'],r['failed'],r['skipped']]==[0,1,0,0] for r in rows)
 assert {r['step'] for r in rows}=={'alex-post-rls','sam-post-rls'}
 assert all(r['method'].endswith('testGETOnlyRecordedReminderAndBothImmutableOperations') for r in rows)
 restoration=read(RUN/'restoration.json');assert restoration['before']==restoration['after']
 assert all(restoration[k] for k in ['all64Empty','originalScopesUnchanged','initialUISettingsRestored','foregroundLaunchAfterTests','ownedPlansRemoved','scopedCaffeinateStopped'])
 assert all(v=={'appearance':'light','content_size':'large'} for v in read(RUN/'initial-ui-settings.json').values())
 terminal=read(RUN/'terminal.json');assert terminal['BothPostRLSGETMethodsPassed']
 assert terminal['NativeSaveInvocations']==terminal['DoneInvocations']==terminal['UIAcceptanceMethods']==0
 review=read(HERE/'visual-review.json')
 assert set(review)=={str(p.relative_to(HERE)) for p in HERE.rglob('*.png')} and len(review)==2
 for name,value in review.items():
  assert value['reviewed'] and value['safeFictionalScope'] and value['sha256']==digest((HERE/name).read_bytes())


if __name__=='__main__':
 count=verify_inventory();verify_sdk();verify_reads(verify_request());verify_outcomes()
 print(json.dumps({'passed':True,'files':count,'nativeInputs':1122,'nativeMethodsPassed':2,'nativeMethodsFailed':0,'reviewedPNGs':2}))
