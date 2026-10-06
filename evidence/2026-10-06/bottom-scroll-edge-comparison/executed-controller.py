from pathlib import Path
import importlib.util,fcntl,hashlib,json,os,plistlib,sqlite3,subprocess,time,shutil
os.umask(0o077)
PRIMARY='C3ABC0D4-CFD4-4F23-8CC3-0E542014803A'
PARTNER='CA0BCEDE-A297-493A-8921-9E31F8B65783'
ACTOR='791f7261-6c9d-4061-9c8a-57aa6e0b0200'
PEER='e5f80cfd-b69a-4aa0-a267-75784e943676'
HOUSEHOLD='be772ffd-3ab5-41d5-8438-647a79a553da'
SOURCE='6997138485f3f8088fc03682432de74879e19659'
ORIGINAL=Path('/private/tmp/nest-active-bill-reminder-save-validated-20261006')
SDK=Path('/private/tmp/nest-active-bill-reminder-save-validated-sdk-20261006')
OUT=Path('/private/tmp/nest-bottom-scroll-edge-comparison-20261006')
ROOT=Path('/private/tmp/nest-current-qa-82a')
UI=Path('/private/tmp/nest-bottom-scroll-edge-candidate-ui-20261006')
BASE_UI=Path('/private/tmp/nest-active-bill-reminder-save-validated-ui-20261006')
PACKAGES=Path('/private/tmp/nest-swiftui-accessibility-20261005/SourcePackages')
CANDIDATE='e528ab3291d5a7030e24b23b5d452d3991f15cf1'
EXCLUDED={'chore_snapshots','grocery_snapshots','meal_weeks','planned_recipes','cooking_profiles','food_profiles','ingredient_reviews','meal_preparation_snapshots','money_read_snapshots','recipe_read_snapshots','renewal_read_snapshots'}
resolver_path=Path('/private/tmp/nest-selected-test-products-20261006.py')
spec=importlib.util.spec_from_file_location('selected_test_products',resolver_path)
resolver=importlib.util.module_from_spec(spec);spec.loader.exec_module(resolver)


def state(sim,allow_owned=False):
    container=Path(subprocess.check_output(['xcrun','simctl','get_app_container',sim,'ch.drrius.nest','data'],text=True).strip())
    files=list((container/'Library/Application Support').glob('nest-offline-*.sqlite')); assert len(files)==1
    con=sqlite3.connect('file:'+str(files[0])+'?mode=ro',uri=True)
    try:
        counts={}
        for (table,) in con.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall():
            assert table.replace('_','').isalnum()
            columns={row[1] for row in con.execute('PRAGMA table_info("'+table+'")')}
            if {'body','actor','household'}.issubset(columns) and table not in EXCLUDED:
                counts[table]=con.execute('SELECT COUNT(*) FROM "'+table+'" WHERE body IS NOT NULL AND body != ?',('null',)).fetchone()[0]
        assert len(counts)==64
        expected={key:0 for key in counts}
        if allow_owned:expected['recurring_reminder_requests']=1
        assert counts==expected
        scope=con.execute('SELECT actor,household FROM offline_scope WHERE id=1').fetchone()
        return {'actor':scope[0].lower() if scope else None,'household':scope[1].lower() if scope else None,'emptyJournals':sum(value==0 for value in counts.values()),'ownedReminderRequest':counts['recurring_reminder_requests']}
    finally: con.close()

def absolute(value,directory):
    if isinstance(value,str): return value.replace('__TESTROOT__',str(directory))
    if isinstance(value,list): return [absolute(v,directory) for v in value]
    if isinstance(value,dict): return {k:absolute(v,directory) for k,v in value.items()}
    return value

def prepare(scheme,derived):
    args=['xcodebuild','-project',str(ROOT/'apps/ios/Nest.xcodeproj'),'-scheme',scheme,'-configuration','Debug','-destination','platform=iOS Simulator,id='+PRIMARY,'-derivedDataPath',str(derived),'-clonedSourcePackagesDirPath',str(PACKAGES),'-xcconfig','/private/tmp/nest-swiftui-test.xcconfig','-parallel-testing-enabled','NO','CODE_SIGNING_ALLOWED=YES','CODE_SIGN_IDENTITY=-','build-for-testing']
    with (OUT/(scheme+'-prepare.log')).open('w') as log:
        result=subprocess.run(args,stdout=log,stderr=subprocess.STDOUT)
    assert result.returncode==0, 'Inspect protected prepare log'
    app=derived/'Build/Products/Debug-iphonesimulator/Nest.app'
    info=plistlib.loads((app/'Info.plist').read_bytes())
    assert info['NEST_API_URL']=='https://nest-test-api-drrius-projects.vercel.app'
    assert info['NEST_SUPABASE_URL']=='https://tkjixmujjoustdiedfmw.supabase.co'
    assert info['NEST_PUSH_ENABLED']=='false'
    assert info['CFBundleVersion']=='19'
    subprocess.run(['codesign','--verify','--deep','--strict',str(app)],check=True,capture_output=True)
    plans=list((derived/'Build/Products').glob(scheme+'_*.xctestrun')); assert len(plans)==1
    plan=absolute(plistlib.loads(plans[0].read_bytes()),plans[0].parent)
    logpath=OUT/(scheme+'-prepare.log');lines=logpath.read_text().splitlines()
    needle='RootAccessibilityTests.swift'
    compiled=[line for line in lines if needle in line and ('SwiftCompile' in line or 'swift-frontend' in line)]
    assert compiled, 'Fresh compile must name the owned acceptance source'
    binaries={str(p.relative_to(derived)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (derived/'Build/Products/Debug-iphonesimulator').rglob('*') if p.is_file() and p.name in ['Nest','Nest.debug.dylib','NestAppTests','NestAccessibilityTests']}
    selected='NestAccessibilityTests' if scheme=='NestAccessibility' else 'NestAppTests'
    paths={selected:resolver.selected_products(plan,selected,plans[0].parent)}
    (OUT/(scheme+'-build-attestation.json')).write_text(json.dumps({'derivedData':str(derived),'prepareLogSha256':hashlib.sha256(logpath.read_bytes()).hexdigest(),'ownedSourceCompileLines':compiled,'binarySha256':binaries,'resolvedProductPaths':paths,'freshDirectoryRequired':True},indent=2)+'\n')
    return plan

def run(key,sim,suite,method,environment):
    case=OUT/key; case.mkdir()
    source=ui_plan if suite=='NestAccessibilityTests' else sdk_plan
    plan=plistlib.loads(plistlib.dumps(source))
    plan[suite].setdefault('EnvironmentVariables',{}).update(environment)
    selected=case/'selected.xctestrun'; selected.write_bytes(plistlib.dumps(plan)); selected.chmod(0o600)
    args=['xcodebuild','-xctestrun',str(selected),'-destination','platform=iOS Simulator,id='+sim,'-parallel-testing-enabled','NO','-resultBundlePath',str(case/'result.xcresult'),'-only-testing:'+suite+'/'+method,'test-without-building']
    with (case/'test.log').open('w') as log:
        result=subprocess.run(args,stdout=log,stderr=subprocess.STDOUT)
    summary=json.loads(subprocess.check_output(['xcrun','xcresulttool','get','test-results','summary','--path',str(case/'result.xcresult')],text=True))
    row={'step':key,'simulator':sim,'method':method,'exitCode':result.returncode,'passed':summary['passedTests'],'failed':summary['failedTests'],'skipped':summary['skippedTests'],'seconds':round(summary['finishTime']-summary['startTime'],3)}
    results.append(row); (OUT/'results.json').write_text(json.dumps(results,indent=2)+'\n'); print(json.dumps(row),flush=True)
    return row

def plan_from(derived,scheme,attestation=None):
 paths=list((derived/'Build/Products').glob(scheme+'_*.xctestrun'));assert len(paths)==1
 plan=absolute(plistlib.loads(paths[0].read_bytes()),paths[0].parent)
 suite='NestAppTests' if scheme=='Nest' else 'NestAccessibilityTests'
 info=plistlib.loads((derived/'Build/Products/Debug-iphonesimulator/Nest.app/Info.plist').read_bytes())
 assert info['NEST_API_URL']=='https://nest-test-api-drrius-projects.vercel.app' and info['NEST_SUPABASE_URL']=='https://tkjixmujjoustdiedfmw.supabase.co'
 assert info['NEST_PUSH_ENABLED']=='false' and info['CFBundleVersion']=='19'
 attested=json.loads((attestation or OUT/(scheme+'-build-attestation.json')).read_text())
 assert resolver.selected_products(plan,suite,paths[0].parent)==attested['resolvedProductPaths'][suite]
 for path,value in attested['binarySha256'].items():assert hashlib.sha256((derived/path).read_bytes()).hexdigest()==value
 subprocess.run(['codesign','--verify','--deep','--strict',str(derived/'Build/Products/Debug-iphonesimulator/Nest.app')],check=True,capture_output=True)
 return plan

def observe(key,sim,name,phase,saved=None):
 env={'NEST_QA_ACTIVE_BILL_REMINDER_RECEIPT_READ':'20261006','NEST_QA_ACTIVE_BILL_REMINDER_RECEIPT_NAME':name,'NEST_QA_ACTIVE_BILL_REMINDER_RECEIPT_PHASE':phase,'NEST_QA_ACTIVE_BILL_ORIGINAL_BASELINE_JSON':json.dumps(references['originalBaseline']),'NEST_QA_ACTIVE_BILL_ORIGINAL_REQUEST_JSON':json.dumps(references['originalRequest']),'NEST_QA_ACTIVE_BILL_RULE_JSON':json.dumps(references['ownedRule']),'NEST_QA_ACTIVE_BILL_REMOVED_HISTORY_JSON':json.dumps(references['knownRemovedHistory'])}
 if baseline is None:env['NEST_QA_ACTIVE_BILL_CAPTURE']='establish_extended_before_snapshot'
 else:env['NEST_QA_ACTIVE_BILL_EXTENDED_BASELINE_JSON']=json.dumps(baseline)
 if saved is not None:
  env['NEST_QA_ACTIVE_BILL_REMINDER_REQUEST_JSON']=json.dumps(saved)
  env['NEST_QA_ACTIVE_BILL_REMINDER_OPERATION_ID']=saved['command']['operationId']
 method='testGETOnlyNilBeforeAndCompleteExtendedBaseline' if phase=='before' else 'testGETOnlyRecordedReminderAndBothImmutableOperations'
 row=run(key,sim,'NestAppTests','HostedActiveRecurringReminderReceiptReadTests/'+method,env)
 case=OUT/key
 subprocess.run(['xcrun','xcresulttool','export','attachments','--path',str(case/'result.xcresult'),'--output-path',str(case/'attachments')],check=True,capture_output=True)
 records=[]
 for p in (case/'attachments').glob('*.json'):
  value=json.loads(p.read_text())
  if isinstance(value,dict) and {'actor','household','phase','canonical','originalRuleRecovery'}.issubset(value):records.append(value)
 if records:
  assert len(records)==1
  (case/'native-read.json').write_text(json.dumps(records[0],indent=2)+'\n')
 assert [row['exitCode'],row['passed'],row['failed'],row['skipped']]==[0,1,0,0],'Stop first failure; never repeat consumed Save'
 assert len(records)==1
 return records[0]

def ui_settings():
 values={}
 for sim in [PRIMARY,PARTNER]:
  values[sim]={key:subprocess.check_output(['xcrun','simctl','ui',sim,key],text=True).strip() for key in ['appearance','content_size']}
  assert values[sim]=={'appearance':'light','content_size':'large'},'Require and preserve measured initial large/light'
 return values


def audit(key,plan):
 global ui_plan
 ui_plan=plan
 row=run(key,PRIMARY,'NestAccessibilityTests','RootAccessibilityTests/testTodayAccessibility',{})
 case=OUT/key
 subprocess.run(['xcrun','xcresulttool','export','attachments','--path',str(case/'result.xcresult'),'--output-path',str(case/'attachments')],check=True,capture_output=True)
 issues=[]
 for path in (case/'attachments').glob('*.json'):
  value=json.loads(path.read_text())
  if isinstance(value,dict) and {'summary','detail','label','frame','tabBarFrame'}.issubset(value):issues.append(value)
 (case/'all-findings.json').write_text(json.dumps(issues,indent=2)+'\n')
 contrast=[value for value in issues if 'contrast' in (value['summary']+' '+value['detail']).lower()]
 return {'method':row,'allFindings':len(issues),'contrastFindings':len(contrast),'boundContrastFindings':sum(bool(v['label']) for v in contrast),'unboundContrastFindings':sum(not v['label'] for v in contrast),'nonContrastIdentities':[[v['summary'],v['detail'],v['label']] for v in issues if v not in contrast]}


def original_states():
 result={'alex':state(PRIMARY),'sam':state(PARTNER)}
 assert result['alex']['actor']==ACTOR and result['sam']['actor']==PEER
 assert result['alex']['household']==result['sam']['household']==HOUSEHOLD
 return result

lock=open('/private/tmp/nest-food-controls-ui-actor.lock','a+')
fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
assert not OUT.exists() and not UI.exists();OUT.mkdir(mode=0o700)
expected=json.loads(Path('/private/tmp/nest-bottom-scroll-edge-retained-proof.json').read_text())
for filename,value in expected.items():
 data=json.loads((ORIGINAL/filename).read_text())
 assert hashlib.sha256(json.dumps(data,sort_keys=True,separators=(',',':')).encode()).hexdigest()==value
 target=OUT/filename
 if filename=='NestAccessibility-build-attestation.json':target=OUT/'BaselineUI-build-attestation.json'
 if filename=='source-input-hashes.json':target=OUT/'retained-source-input-hashes.json'
 shutil.copy2(ORIGINAL/filename,target)
shutil.copy2('/private/tmp/nest-bottom-scroll-edge-root-proof.json',OUT/'root-source-comparison.json')
references=json.loads((OUT/'references.json').read_text());baseline=json.loads((OUT/'baseline.json').read_text());saved=json.loads((OUT/'captured-reminder-request.json').read_text())
assert saved['command']['operationId'].lower()=='f23e5dfb-cc10-4199-a0f1-bc2cfcbd521c' and saved['result']['status']=='recorded'
sdk_plan=plan_from(SDK,'Nest');baseline_plan=plan_from(BASE_UI,'NestAccessibility',OUT/'BaselineUI-build-attestation.json')
results=[];comparison={};before=original_states();settings=ui_settings();final_reads=False
(OUT/'initial-ui-settings.json').write_text(json.dumps(settings,indent=2)+'\n')
awake=subprocess.Popen(['caffeinate','-dimsu','-t','1200'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
 subprocess.run(['tar','-xf','/private/tmp/nest-bottom-scroll-edge-source.tar','-C',str(ROOT)],check=True)
 frozen=json.loads(Path('/private/tmp/nest-bottom-scroll-edge-inputs.json').read_text())
 current={str(p.relative_to(ROOT/'apps/ios')):hashlib.sha256(p.read_bytes()).hexdigest() for folder in ['Nest','AppTests','UITests','Tests','Nest.xcodeproj'] for p in (ROOT/'apps/ios'/folder).rglob('*') if p.is_file() and 'xcuserdata' not in p.parts and p.name!='README.md'}
 assert current==frozen and len(current)==1123
 (OUT/'source-input-hashes.json').write_text(json.dumps(current,sort_keys=True)+'\n')
 (OUT/'source-pinning.json').write_text(json.dumps({'CandidateSource':CANDIDATE,'CandidateInputs':1123,'BaselineUIAndSDKSource':SOURCE,'RetainedInputs':1122,'UnfilteredAuditInvocations':2,'NoAuditFilters':True,'SaveInvocations':0},indent=2)+'\n')
 print('Fresh candidate UI compile e528/all1123; retained699 binary and selected products verified',flush=True)
 candidate_plan=prepare('NestAccessibility',UI)
 a=observe('alex-before',PRIMARY,'Test Alex','saved',saved);b=observe('sam-before',PARTNER,'Test Sam','saved',saved)
 assert a['canonical']==b['canonical']==baseline and a['reminder']==b['reminder']
 comparison['baseline']=audit('baseline-today',baseline_plan)
 comparison['candidate']=audit('candidate-today',candidate_plan)
 from collections import Counter
 improved=comparison['candidate']['contrastFindings']<comparison['baseline']['contrastFindings']
 old=Counter(tuple(v) for v in comparison['baseline']['nonContrastIdentities'])
 new=Counter(tuple(v) for v in comparison['candidate']['nonContrastIdentities'])
 regressions=list((new-old).elements())
 comparison['newNonContrastIdentities']=regressions
 comparison['contrastCountImproved']=improved
 (OUT/'comparison.json').write_text(json.dumps(comparison,indent=2)+'\n')
 print(json.dumps(comparison),flush=True)
 if improved and not regressions:
  ui_plan=candidate_plan
  run('candidate-four-header-alignment',PRIMARY,'NestAccessibilityTests','RootLayoutConsistencyTests/testFourTabsShareHeaderAlignment',{'NEST_QA_MANUAL_WEEK':'20261005','NEST_QA_MANUAL_WEEK_ACTION':'root_layout','NEST_QA_MANUAL_WEEK_NAME':'Test Alex'})
 a=observe('alex-final',PRIMARY,'Test Alex','saved',saved);b=observe('sam-final',PARTNER,'Test Sam','saved',saved)
 assert a['canonical']==b['canonical']==baseline and a['reminder']==b['reminder'];final_reads=True
finally:
 for path in OUT.glob('*/selected.xctestrun'):path.unlink()
 for sim in [PRIMARY,PARTNER]:
  for key,value in settings[sim].items():subprocess.run(['xcrun','simctl','ui',sim,key,value],check=True)
  subprocess.run(['xcrun','simctl','launch',sim,'ch.drrius.nest'],check=True,capture_output=True)
 time.sleep(10)
 for name,sim in [('alex',PRIMARY),('sam',PARTNER)]:subprocess.run(['xcrun','simctl','io',sim,'screenshot',str(OUT/(name+'-terminal-screen.png'))],check=True,capture_output=True)
 awake.terminate();awake.wait();after=original_states();assert before==after and ui_settings()==settings
 (OUT/'restoration.json').write_text(json.dumps({'before':before,'after':after,'all64Empty':True,'originalScopesUnchanged':True,'initialUISettingsRestored':True,'foregroundLaunchAfterTests':True,'ownedPlansRemoved':True,'scopedCaffeinateStopped':True},indent=2)+'\n')
 (OUT/'terminal.json').write_text(json.dumps({'ComparisonCompleted':'candidate' in comparison,'BothFinalReadsPassed':final_reads,'SaveInvocations':0,'AuditInvocations':sum(r['method']=='RootAccessibilityTests/testTodayAccessibility' for r in results),'NoRepeatedAudit':True},indent=2)+'\n')
print('Bottom scroll edge comparison terminal',flush=True)
