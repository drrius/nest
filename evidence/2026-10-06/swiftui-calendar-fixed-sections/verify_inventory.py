#!/usr/bin/env python3
"""Verify the immutable Calendar fixed-section comparison; never invoke API/native actions."""
import hashlib,io,json,re,subprocess,tarfile
from collections import Counter
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
RUN=HERE/'comparison'
SOURCE='6997138485f3f8088fc03682432de74879e19659'
CANDIDATE='42bd044b060b006698b41726094fb6c49902a150'
BASE_UI='310524b183cf48810e1447196fa7dab38509a6bc'
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

def read_baseline():
    baseline = read(RUN / 'baseline.json')
    references = read(RUN / 'references.json')
    assert len(baseline['originalRules']) == 7
    assert sorted(r['status'] for r in baseline['originalRules']) == ['cancelled'] * 3 + ['paused'] * 4
    assert sum(len(p['rules']) for p in baseline['allRulePages']) == 8
    history = baseline['historyPages']
    assert history[-1].get('next') is None and sum(len(p['events']) for p in history) == 62
    assert baseline['knownRemovedRenewalHistory'] == references['knownRemovedHistory']
    return baseline, references


def verify_read_identity(row, baseline, references):
    assert row['canonical'] == baseline and row['historyComplete'] and row['historyEventCount'] == 62
    assert row['hostedCommands'] == 0 and row['rule'] == references['ownedRule']
    assert row['household'].lower() == HH and row['actor'].lower() in [ALEX, SAM]


def verify_read_receipts(row, references, saved):
    owner = row['actor'].lower() == ALEX
    original = row['originalRuleRecovery']
    if owner:
        assert original == references['originalRequest']['result']
    else:
        assert original['status'] == 'unresolved' and original.get('receipt') is None
    assert row['phase'] == 'saved'
    assert row['reminder']['reminder'] == saved['result']['receipt']['reminder']
    recovery = row['reminderOperationRecovery']
    if owner:
        assert recovery == saved['result']
    else:
        assert recovery['status'] == 'unresolved' and recovery.get('receipt') is None
        assert recovery['operationId'].lower() == OP and recovery['actorId'].lower() == SAM


def verify_reads(saved):
    baseline, references = read_baseline()
    rows = [read(p) for p in RUN.glob('*/native-read.json')]
    assert len(rows) == 4
    for row in rows:
        verify_read_identity(row, baseline, references)
        verify_read_receipts(row, references, saved)


def source_map(commit,filename,count):
 values=read(filename);assert len(values)==count
 raw=subprocess.check_output(['git','archive',commit,'apps/ios'],cwd=ROOT)
 with tarfile.open(fileobj=io.BytesIO(raw)) as archive:
  for name,value in values.items():assert digest(archive.extractfile('apps/ios/'+name).read())==value,name
 return values

def issue_id(issue):
 return (issue['summary'],issue['detail'],issue['label'])

def verify_restore_and_reviews():
 value=read(RUN/'restoration.json');assert value['before']==value['after']
 assert all(value[k] for k in ['all64Empty','originalScopesUnchanged','initialUISettingsRestored','foregroundLaunchAfterTests','ownedPlansRemoved','scopedCaffeinateStopped'])
 assert all(v=={'appearance':'light','content_size':'large'} for v in read(RUN/'initial-ui-settings.json').values())
 terminal=read(RUN/'terminal.json')
 assert terminal['ComparisonCompleted'] and terminal['BothFinalReadsPassed']
 assert terminal['AuditInvocations']==2 and terminal['SaveInvocations']==0 and terminal['NoRepeatedAudit']
 reviews=read(HERE/'visual-review.json')
 assert set(reviews)=={str(p.relative_to(HERE)) for p in HERE.rglob('*.png')}
 for name,value in reviews.items():
  assert value['reviewed'] and value['safeFictionalScope'] and value['sha256']==digest((HERE/name).read_bytes())


def verify_sources():
 sdk=source_map(SOURCE,RUN/'retained-source-input-hashes.json',1122)
 baseline=source_map(BASE_UI,RUN/'baseline-ui-source-input-hashes.json',1123)
 candidate=source_map(CANDIDATE,RUN/'source-input-hashes.json',1123)
 proof=read(RUN/'root-source-comparison.json');name=proof['calendarPath']
 raw=subprocess.check_output(['git','show',proof['candidateParent']+':apps/ios/'+name],cwd=ROOT)
 assert baseline[name]==digest(raw)==proof['candidateParentSha256']==proof['baselineSha256']
 assert candidate[name]==proof['candidateSha256']
 save=ROOT/'evidence/2026-10-06/swiftui-native-recurring-reminder-save/recorded-save'
 inline=ROOT/'evidence/2026-10-06/swiftui-renewal-inline-title/inline-title'
 assert read(RUN/'Nest-build-attestation.json')==read(save/'Nest-build-attestation.json')
 assert read(RUN/'BaselineUI-build-attestation.json')==read(inline/'NestAccessibility-build-attestation.json')
 current=read(RUN/'NestAccessibility-build-attestation.json')
 assert current['freshDirectoryRequired'] and len(current['binarySha256'])>=3
 assert 'RootAccessibilityTests.swift' in str(current['ownedSourceCompileLines'])
 assert current['resolvedProductPaths']['NestAccessibilityTests']
 pin=read(RUN/'source-pinning.json')
 assert pin['CandidateSource']==CANDIDATE and pin['BaselineUISource']==BASE_UI and pin['SDKSource']==SOURCE
 assert pin['NoAuditFilters'] and pin['UnfilteredAuditInvocations']==2 and pin['SaveInvocations']==0


def is_font(issue):
 text=(issue['summary']+' '+issue['detail']).lower()
 return 'font' in text or 'dynamic type' in text


def verify_audit_report(folder, report):
 issues=read(RUN/folder/'all-findings.json');font=[i for i in issues if is_font(i)]
 assert len(issues)==report['allFindings'] and len(font)==report['fontFindings']
 assert sum(bool(i['label']) for i in font)==report['boundFontFindings']
 assert sum(not i['label'] for i in font)==report['unboundFontFindings']
 other=[issue_id(i) for i in issues if i not in font]
 assert other==[tuple(v) for v in report['nonFontIdentities']]
 return Counter(other)


def verify_methods():
 rows=read(RUN/'results.json')
 audits=[r for r in rows if r['method']=='RootAccessibilityTests/testCalendarAccessibility']
 assert len(audits)==2 and {r['step'] for r in audits}=={'baseline-calendar','candidate-calendar'}
 readers=[r for r in rows if r['method'].startswith('HostedActiveRecurringReminderReceiptReadTests/')]
 assert len(readers)==4 and all([r['exitCode'],r['passed'],r['failed'],r['skipped']]==[0,1,0,0] for r in readers)
 assert len(rows)==6


def verify_audits():
 comparison=read(RUN/'comparison.json');reports={}
 for name,folder in [('baseline','baseline-calendar'),('candidate','candidate-calendar')]:
  reports[name]=verify_audit_report(folder,comparison[name])
 regressions=list((reports['candidate']-reports['baseline']).elements())
 assert regressions==[tuple(v) for v in comparison['newNonFontIdentities']]
 assert comparison['fontCountImproved']==(comparison['candidate']['fontFindings']<comparison['baseline']['fontFindings'])
 verify_methods()


if __name__=='__main__':
 count=verify_inventory();verify_sources();verify_reads(verify_request());verify_audits();verify_restore_and_reviews()
 print(json.dumps({'passed':True,'files':count,'SDKInputs':1122,'baselineUIInputs':1123,'candidateUIInputs':1123,'unfilteredCalendarAudits':2,'canonicalReaderPasses':4}))
