from pathlib import Path
import importlib.util
resolver_path=Path("/private/tmp/nest-selected-test-products-20261006.py")
resolver_spec=importlib.util.spec_from_file_location("selected_test_products",resolver_path)
resolver=importlib.util.module_from_spec(resolver_spec)
resolver_spec.loader.exec_module(resolver)
import fcntl,hashlib,json,os,plistlib,sqlite3,subprocess,time
os.umask(0o077)
PRIMARY='C3ABC0D4-CFD4-4F23-8CC3-0E542014803A'
PARTNER='CA0BCEDE-A297-493A-8921-9E31F8B65783'
ACTOR='791f7261-6c9d-4061-9c8a-57aa6e0b0200'
PEER='e5f80cfd-b69a-4aa0-a267-75784e943676'
HOUSEHOLD='be772ffd-3ab5-41d5-8438-647a79a553da'
ROOT=Path('/private/tmp/nest-current-qa-82a')
SDK=Path('/private/tmp/nest-variable-reminder-fixture-sdk-20261006')
UI=Path('/private/tmp/nest-active-bill-drafts-unique-form-ui-20261006')
PACKAGES=Path('/private/tmp/nest-swiftui-accessibility-20261005/SourcePackages')
EXCLUDED={'chore_snapshots','grocery_snapshots','meal_weeks','planned_recipes','cooking_profiles','food_profiles','ingredient_reviews','meal_preparation_snapshots','money_read_snapshots','recipe_read_snapshots'}
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
        if allow_owned:expected['recurring_commands']=1
        assert counts==expected
        scope=con.execute('SELECT actor,household FROM offline_scope WHERE id=1').fetchone()
        return {'actor':scope[0].lower() if scope else None,'household':scope[1].lower() if scope else None,'emptyJournals':sum(value==0 for value in counts.values()),'ownedRecurringRequest':counts['recurring_commands']}
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
    needle='NativeActiveRecurringReminderDraftTests.swift' if scheme=='NestAccessibility' else 'HostedActiveRecurringReminderFixtureReadTests.swift'
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


def details(sim,allow_owned=False):
    container=Path(subprocess.check_output(['xcrun','simctl','get_app_container',sim,'ch.drrius.nest','data'],text=True).strip())
    files=list((container/'Library/Application Support').glob('nest-offline-*.sqlite'));assert len(files)==1
    database=files[0];info=database.stat()
    con=sqlite3.connect('file:'+str(database)+'?mode=ro',uri=True)
    try:
        names={r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        counts={table:con.execute('SELECT COUNT(*) FROM "'+table+'"').fetchone()[0] for table in sorted(EXCLUDED) if table in names}
        scope=con.execute('SELECT actor,household,lease FROM offline_scope WHERE id=1').fetchone()
        return {'state':state(sim,allow_owned=allow_owned),'containerIdentity':container.name,'databaseName':database.name,'inode':info.st_ino,'device':info.st_dev,'snapshotCounts':counts,'lease':scope[2] if scope else None}
    finally:con.close()

def export(key):
    case=OUT/key
    subprocess.run(['xcrun','xcresulttool','export','attachments','--path',str(case/'result.xcresult'),'--output-path',str(case/'attachments')],check=True,capture_output=True)

def saved_request():
 container=Path(subprocess.check_output(['xcrun','simctl','get_app_container',PRIMARY,'ch.drrius.nest','data'],text=True).strip())
 database=next((container/'Library/Application Support').glob('nest-offline-*.sqlite'))
 con=sqlite3.connect('file:'+str(database)+'?mode=ro',uri=True)
 try:
  rows=con.execute('SELECT body FROM recurring_commands WHERE lower(actor)=? AND lower(household)=?',(ACTOR,HOUSEHOLD)).fetchall();assert len(rows)<=1
  return json.loads(rows[0][0]) if rows else None
 finally:con.close()

def observe(key,sim,name,phase,saved=None):
 env={'NEST_QA_RECURRING_FIXTURE_READ':'20261006','NEST_QA_RECURRING_FIXTURE_NAME':name,'NEST_QA_RECURRING_FIXTURE_TITLE':TITLE,'NEST_QA_RECURRING_FIXTURE_PHASE':phase}
 if baseline is None:env['NEST_QA_RECURRING_FIXTURE_CAPTURE']='establish_original_baseline'
 else:env['NEST_QA_RECURRING_FIXTURE_BASELINE_JSON']=json.dumps(baseline)
 if saved is not None:env['NEST_QA_RECURRING_FIXTURE_REQUEST_JSON']=json.dumps(saved)
 row=run(key,sim,'NestAppTests','HostedActiveRecurringReminderFixtureReadTests/testGETOnlyCompleteBaselineOrExactCreatedVariableRule',env)
 subprocess.run(['xcrun','xcresulttool','export','attachments','--path',str(OUT/key/'result.xcresult'),'--output-path',str(OUT/key/'attachments')],check=True,capture_output=True)
 records=[]
 for f in (OUT/key/'attachments').glob('*.json'):
  value=json.loads(f.read_text())
  if isinstance(value,dict) and {'actor','household','phase','canonical','rulePages'}.issubset(value):records.append(value)
 if records:(OUT/key/'native-read.json').write_text(json.dumps(records[0],indent=2)+'\n')
 assert [row['exitCode'],row['passed'],row['failed'],row['skipped']]==[0,1,0,0], 'Stop first failure; never repeat consumed Save'
 assert len(records)==1
 return records[0]

def assert_recorded(saved):
 assert saved is not None and not saved['cancellationRequested']
 rule=saved['command']['rule'];config=rule['configuration'];receipt=saved['result']['receipt']
 assert saved['result']['status']=='recorded' and receipt['status']=='active' and receipt.get('approvalId') is None
 assert rule.get('expectedRevision') is None and rule['firstDueOn']=='2026-11-01'
 assert config['description']==TITLE and config['mode']=='variable' and config['payerId'].lower()==ACTOR
 assert config['startDate']=='2026-11-01' and config['schedule']=={'kind':'monthly','dayOfMonth':1}
 assert config.get('categoryId') is None and config.get('note') is None
 assert config.get('amountCentimes') is None and config.get('allocations') is None
 assert receipt['rule']==rule and receipt['operationId']==saved['command']['operationId']
 assert receipt['actorId'].lower()==ACTOR and receipt['householdId'].lower()==HOUSEHOLD



OUT=Path('/private/tmp/nest-active-bill-drafts-unique-form-20261006');assert not OUT.exists();OUT.mkdir(mode=0o700)
ORIGINAL=Path('/private/tmp/nest-variable-reminder-fixture-20261006')
TITLE='Nest QA reminder bill 0610-5d1a'
SOURCE='ed97c1985cc6083befe329f729c8583a042a6f34'
lock=open('/private/tmp/nest-food-controls-ui-actor.lock','a+');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
EXCLUDED.add('renewal_read_snapshots');assert not UI.exists()
before={'alex':state(PRIMARY),'sam':state(PARTNER)}
assert before['alex']['actor']==ACTOR and before['sam']['actor']==PEER and before['alex']['household']==before['sam']['household']==HOUSEHOLD
assert saved_request() is None
saved=json.loads((ORIGINAL/'owned-variable-request.json').read_text());assert_recorded(saved)
assert saved['command']['operationId'].lower()=='5bdfcaeb-3f20-4fa3-9db9-0f0902eede8f'
assert saved['command']['rule']['ruleId'].lower()=='f854e3a3-ffda-4eb7-86e5-d3933d938444'
results=[];baseline=json.loads((ORIGINAL/'baseline.json').read_text());profiles=[];after_reads=False
awake=subprocess.Popen(['caffeinate','-dimsu','-t','1200'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
 subprocess.run(['tar','-xf','/private/tmp/nest-active-bill-drafts-unique-form-source.tar','-C',str(ROOT)],check=True)
 frozen=json.loads(Path('/private/tmp/nest-active-bill-drafts-unique-form-inputs.json').read_text())
 previous=json.loads((ORIGINAL/'source-input-hashes.json').read_text())
 source={str(p.relative_to(ROOT/'apps/ios')):hashlib.sha256(p.read_bytes()).hexdigest() for folder in ['Nest','AppTests','UITests','Tests','Nest.xcodeproj'] for p in (ROOT/'apps/ios'/folder).rglob('*') if p.is_file() and 'xcuserdata' not in p.parts and p.name!='README.md'}
 assert source==frozen and len(source)==1119
 assert {k:v for k,v in previous.items() if not k.startswith('UITests/')}=={k:v for k,v in source.items() if not k.startswith('UITests/')}
 attested=json.loads((ORIGINAL/'Nest-build-attestation.json').read_text())
 for name,digest in attested['binarySha256'].items():assert hashlib.sha256((SDK/name).read_bytes()).hexdigest()==digest
 plans=list((SDK/'Build/Products').glob('Nest_*.xctestrun'));assert len(plans)==1
 sdk_plan=absolute(plistlib.loads(plans[0].read_bytes()),plans[0].parent)
 resolved=resolver.selected_products(sdk_plan,'NestAppTests',plans[0].parent)
 assert resolved==attested['resolvedProductPaths']['NestAppTests']
 (OUT/'Nest-build-attestation.json').write_text(json.dumps(attested,indent=2)+'\n')
 (OUT/'sdk-source-input-hashes.json').write_text(json.dumps(previous,sort_keys=True)+'\n')
 (OUT/'source-input-hashes.json').write_text(json.dumps(source,sort_keys=True)+'\n')
 (OUT/'source-pinning.json').write_text(json.dumps({'PreparedSourceCommit':SOURCE,'SDKSourceCommit':'c0cd3a8da4f1f56e8566a3e4da47d89346e379b0','NativeInputs':1119,'SDKInputs':1118,'SDKReuseOnlyUITestsChanged':True,'SDKBinaryAndSelectedPathsRevalidated':True,'FreshUIBuildRequired':True,'POSTBudget':0},indent=2)+'\n')
 (OUT/'baseline.json').write_text(json.dumps(baseline,indent=2)+'\n')
 (OUT/'owned-original-request.json').write_text(json.dumps(saved,indent=2)+'\n')
 print('Fresh active-bill draft UI compile; SDKc0 non-UI inputs/binaries unchanged; paired created GET baseline; POST0',flush=True)
 ui_plan=prepare('NestAccessibility',UI)
 a=observe('alex-before',PRIMARY,'Test Alex','created',saved);b=observe('sam-before',PARTNER,'Test Sam','created',saved)
 assert a['canonical']==b['canonical']==baseline and a['rule']==b['rule'] and a['reminder']==b['reminder']
 assert a['rule']['ruleId'].lower()=='f854e3a3-ffda-4eb7-86e5-d3933d938444'
 assert a['rule']['revision'].lower()=='528417a1-b97a-4be4-9e63-ad7c8c03c2be'
 assert a['rule']['nextDueOn']=='2026-11-01' and a['rule']['status']=='active' and a['reminder'].get('reminder') is None
 for profile,size,appearance,method in [('normal_light','large','light','testNormalLightOwnedActiveBillUnsentDraft'),('maximum_dark','accessibility-extra-extra-extra-large','dark','testMaximumDarkOwnedActiveBillUnsentDraft')]:
  assert saved_request() is None and state(PRIMARY)['emptyJournals']==64
  subprocess.run(['xcrun','simctl','ui',PRIMARY,'content_size',size],check=True);subprocess.run(['xcrun','simctl','ui',PRIMARY,'appearance',appearance],check=True)
  env={'NEST_QA_ACTIVE_BILL_DRAFT_UI':'20261006','NEST_QA_ACTIVE_BILL_NAME':'Test Alex','NEST_QA_ACTIVE_BILL_PROFILE':profile,'NEST_QA_ACTIVE_BILL_RULE_ID':'f854e3a3-ffda-4eb7-86e5-d3933d938444','NEST_QA_ACTIVE_BILL_REVISION':'528417a1-b97a-4be4-9e63-ad7c8c03c2be','NEST_QA_ACTIVE_BILL_DUE':'2026-11-01','NEST_QA_ACTIVE_BILL_ACTION':'unsent_navigation_only','NEST_QA_ACTIVE_BILL_POST_BUDGET':'0','NEST_QA_API_ORIGIN':'https://nest-test-api-drrius-projects.vercel.app','NEST_QA_SUPABASE_ORIGIN':'https://tkjixmujjoustdiedfmw.supabase.co','NEST_QA_PUSH_ENABLED':'false'}
  row=run(profile,PRIMARY,'NestAccessibilityTests','NativeActiveRecurringReminderDraftTests/'+method,env)
  subprocess.run(['xcrun','xcresulttool','export','attachments','--path',str(OUT/profile/'result.xcresult'),'--output-path',str(OUT/profile/'attachments')],check=True,capture_output=True)
  passed=[row['exitCode'],row['passed'],row['failed'],row['skipped']]==[0,1,0,0]
  profiles.append({'profile':profile,'wholeMethodPassed':passed})
  if not passed:break
 a=observe('alex-final',PRIMARY,'Test Alex','created',saved);b=observe('sam-final',PARTNER,'Test Sam','created',saved)
 assert a['canonical']==b['canonical']==baseline and a['rule']==b['rule'] and a['reminder']==b['reminder'];after_reads=True
finally:
 for file in OUT.glob('*/selected.xctestrun'):file.unlink()
 for sim in [PRIMARY,PARTNER]:
  subprocess.run(['xcrun','simctl','ui',sim,'content_size','large'],check=True);subprocess.run(['xcrun','simctl','ui',sim,'appearance','light'],check=True)
  subprocess.run(['xcrun','simctl','launch',sim,'ch.drrius.nest'],check=True,capture_output=True)
 time.sleep(10)
 for key,sim in [('alex',PRIMARY),('sam',PARTNER)]:subprocess.run(['xcrun','simctl','io',sim,'screenshot',str(OUT/(key+'-terminal-screen.png'))],check=True,capture_output=True)
 awake.terminate();awake.wait()
 assert saved_request() is None
 after={'alex':state(PRIMARY),'sam':state(PARTNER)}
 (OUT/'restoration.json').write_text(json.dumps({'before':before,'after':after,'all64JournalsEmpty':True,'originalScopesUnchanged':all(before[k]['actor']==after[k]['actor'] and before[k]['household']==after[k]['household'] for k in before),'largeLight':True,'foregroundLaunchAfterTests':True,'selectedPlansRemoved':True,'scopedCaffeinateStopped':True,'allUnsentDraftsDiscarded':len(profiles)==2 and all(p['wholeMethodPassed'] for p in profiles)},indent=2)+'\n')
 (OUT/'terminal.json').write_text(json.dumps({'UIProfiles':profiles,'bothFinalCanonicalReadsPassed':after_reads,'POSTs':0,'NoPositiveReplay':True},indent=2)+'\n')
print('Active variable bill unsent draft phase terminal; POST0',flush=True)
