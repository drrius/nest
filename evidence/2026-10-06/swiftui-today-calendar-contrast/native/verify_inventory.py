#!/usr/bin/env python3
"""Verify immutable Calendar-card viewport contrast evidence; no API/UI/SQL execution."""
import argparse,hashlib,io,json,re,subprocess,tarfile
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[3]
RUN=HERE/'native-run'
SDK='6997138485f3f8088fc03682432de74879e19659'
UI='abc39697678bddd92a5c8ec1f16355826acab902'
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
 verify_map(UI,RUN/'source-input-hashes.json',1126)
 verify_map(SDK,RUN/'sdk-source-input-hashes.json',1122)
 prior=ROOT/'evidence/2026-10-06/swiftui-native-recurring-reminder-save/recorded-save'
 for name in ['Nest-build-attestation.json','baseline.json','references.json','captured-reminder-request.json']:
  assert read(RUN/name)==read(prior/name)
 attested=read(RUN/'NestAccessibility-build-attestation.json')
 assert attested['freshDirectoryRequired'] and len(attested['binarySha256'])==3
 assert attested['resolvedProductPaths']['NestAccessibilityTests']
 for name in ['NativeContrastViewportTests.swift','TodayScreen.swift','TodayCalendarSection.swift']:
  assert name in str(attested['ownedSourceCompileLines'])
 for name,value in read(HERE/'executed-controller-hashes.json').items():assert digest((HERE/'controllers'/name).read_bytes())==value
 pin=read(RUN/'source-pinning.json')
 assert pin['UIExecutedSource']==UI and pin['SDKExecutedSource']==SDK and pin['UIInputs']==1126 and pin['SDKInputs']==1122
 assert read(RUN/'prepared.json')['NoSDKOrUIExecuted']


def methods():
 rows=read(RUN/'results.json');assert len(rows)==5
 passed=[r for r in rows if r['passed']==1 and r['failed']==0 and r['exitCode']==0]
 failed=[r for r in rows if r['passed']==0 and r['failed']==1 and r['exitCode']==65]
 assert len(passed)==4 and len(failed)==1 and failed[0]['step']=='calendar-card' and failed[0]['seconds']==51.358
 assert all(r['skipped']==0 for r in rows)
 terminal=read(RUN/'terminal.json')
 assert terminal['DiagnosticControllerComplete'] and terminal['BothFinalReadsPassed'] and terminal['UIInvocations']==1
 assert terminal['NoRepeatedAudit'] and terminal['UnfilteredContrastOnly'] and not terminal['CalendarActionTapped']
 assert terminal['UIDomainMutationBudget']==terminal['LiveModelInvocations']==0 and not terminal['FindingClosureClaim']
 assert not terminal['WirePOSTCountMeasured'] and terminal['SDKAuthSetupMayPOSTLogin']
 marker=read(RUN/'calendar-card-ui-invocation-consumed.json')
 assert marker['ConsumedBeforeInvocation'] and marker['MaximumUIInvocations']==marker['UnfilteredContrastAuditInvocations']==1 and marker['Source']==UI
 assert read(RUN/'execution-invocation-consumed.json')['ConsumedBeforeAnySDKOrUIInvocation']


def geometry_and_findings():
 folder=RUN/'calendar-card'
 observations=read(folder/'16A489E4-BB36-45EE-ABCA-85CD25E07D6C.json')
 final=observations[-1];assert len(observations)==4 and final['navigation']==[]
 assert final['viewport']==[0,0,375,504] and final['tabBar']==[0,584,375,83]
 expected={'On your calendar':[38,241,136,20.5],
           'Open Calendar to review access. Your personal details stay on this device.':[38,275.5,293,42.5],
           'Open Calendar':[38,332,299,44]}
 assert len(final['targets'])==3
 for target in final['targets']:
  assert target['exists'] and target['hittable'] and target['frame']==expected[target['label']]
  x,y,w,h=target['frame'];assert x>=0 and y>=0 and x+w<=375 and y+h<=504 and 584-y-h>=80
 action=expected['Open Calendar'];assert action[2]>=44 and action[3]>=44
 pans=[]
 for path in folder.glob('*.json'):
  value=read(path)
  if isinstance(value,dict) and 'gestureStart' in value:pans.append(value)
 assert len(pans)==3
 for pan in pans:
  assert pan['gestureStart'][0]==pan['gestureEnd'][0]==16 and pan['scroller']==[0,0,375,667]
  assert pan['scrollBars']==[[342,20,30,564]]
  for x,y,w,h in pan['actionRegions']:assert 16<x
  for point in [pan['gestureStart'],pan['gestureEnd']]:
   assert 0<=point[1]<=584 and not 342<=point[0]<=372
 invocation=read(folder/'83FBFF6B-77D8-4E46-8E20-7E995C9FD9F2.json')
 assert invocation['singleUnfilteredContrastAudit'] and not invocation['calendarActionTapped'] and not invocation['domainMutationInvoked']
 originals=[read(folder/name) for name in ['C440AD17-9F73-4F6F-9F98-ED9A878395E1.json','F785881F-971E-4B8E-B938-25CA0CF0FBDD.json']]
 assert read(HERE/'all-findings.json')==[dict(value,case='calendar-card') for value in originals]
 assert {v['label'] for v in originals}=={'All proposals and saved decisions','Manage renewals'}
 assert all(v['summary']=='Contrast failed' and v['tabBarFrame']==[0,584,375,83] for v in originals)
 assert originals[0]['frame']==[38,533.5,299,44] and originals[1]['frame']==[20,595.5,335,44]
 census=read(HERE/'finding-census.json')
 assert census['reportCount']==2 and census['allReportsRetained'] and census['proximityBandIsDiagnosticNotExemption']
 assert {v['position'] for v in census['positions']}=={'within_64pt_of_bar','below_bar'}


def restoration_and_reviews():
 assert read(RUN/'local-view-before.json')==read(RUN/'local-view-final.json')
 restoration=read(RUN/'restoration.json');assert restoration['before']==restoration['after']
 assert all(restoration[k] for k in ['all64Empty','originalScopesUnchanged','initialUISettingsRestored','foregroundLaunchAfterTests','localViewSemanticsUnchanged','ownedPlansRemoved','scopedCaffeinateStopped'])
 for phase in ['before-ui','final-foreground']:
  proof=read(RUN/(phase+'-scope-settled.json'));assert proof['twoContiguousMatchingSamples'] and proof['originalActorsHousehold64']
 cleanup=read(RUN/'post-terminal-cleanup-confirmed.json')
 assert cleanup['postTerminalIndependentObservation'] and not cleanup['ownedSelectedPlansRemaining']
 assert not cleanup['caffeinateProcesses'] and cleanup['caffeinateQueryExit']==1
 assert all(v=={'appearance':'light','content_size':'large'} for v in read(RUN/'initial-ui-settings.json').values())
 for name,value in read(HERE/'external-metadata-hashes.json').items():assert digest((HERE.parent/name).read_bytes())==value
 review=read(HERE.parent/'root-review.json')
 assert review['nativeSource']==UI and review['rootDirectScreenshotReviews']==8 and len(review['rootIndependentlyCheckedPans'])==3
 assert review['auditResult']=='FAIL' and not review['originalReportsClosed'] and not review['fullAuditClosed']
 pixels=read(HERE.parent/'rendered-calendar-card-contrast.json')
 assert pixels['nativeSource']==UI and pixels['pngSRGBIntent']==0
 image=RUN/'calendar-card/691ABAD7-E29B-4F93-8DC2-9DAF0357218E.png'
 assert pixels['sha256']==digest(image.read_bytes())
 assert not pixels['reportedControlsMeasuredHere'] and not pixels['unfilteredAuditPassed'] and not pixels['fullAccessibilityAuditClosed']
 assert [v['contrastRatio'] for v in pixels['measurements']]==[5.302823778893825,7.492749069147866]
 reviews=read(HERE/'visual-review.json');assert len(reviews)==8
 assert set(reviews)=={str(p.relative_to(HERE)) for p in HERE.rglob('*.png')}
 for name,value in reviews.items():assert value['reviewed'] and value['safeFictionalScope'] and value['sha256']==digest((HERE/name).read_bytes())


if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--allow-untracked-precommit',action='store_true');args=parser.parse_args()
 count=inventory(not args.allow_untracked_precommit)
 sources();reads();methods();geometry_and_findings();restoration_and_reviews()
 print(json.dumps({'passed':True,'files':count,'UIInputs':1126,'SDKInputs':1122,'nativePasses':4,'retainedNativeFailures':1,'unsuppressedContrastReports':2,'trackedInventoryRequired':not args.allow_untracked_precommit}))
