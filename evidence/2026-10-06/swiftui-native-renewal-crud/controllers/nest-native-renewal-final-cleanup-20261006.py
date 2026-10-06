from pathlib import Path
import fcntl, hashlib, json, os, plistlib, sqlite3, subprocess, sys, time

PRIMARY='C3ABC0D4-CFD4-4F23-8CC3-0E542014803A'
PARTNER='CA0BCEDE-A297-493A-8921-9E31F8B65783'
ACTOR='791f7261-6c9d-4061-9c8a-57aa6e0b0200'
PEER='e5f80cfd-b69a-4aa0-a267-75784e943676'
HOUSEHOLD='be772ffd-3ab5-41d5-8438-647a79a553da'
ROOT=Path('/private/tmp/nest-current-qa-82a')
OUT=Path('/private/tmp/nest-native-renewal-crud-20261006')
SDK=Path('/private/tmp/nest-swiftui-partner-sdk-20261005')
UI=Path('/private/tmp/nest-swiftui-accessibility-20261005')
EXCLUDED={'chore_snapshots','grocery_snapshots','meal_weeks','planned_recipes','cooking_profiles','food_profiles','ingredient_reviews','meal_preparation_snapshots','money_read_snapshots','recipe_read_snapshots'}
os.umask(0o077)
assert OUT.exists()
assert not (OUT/'removal-cleanup-started.json').exists(), 'Inspect existing cleanup rather than replay it'
lock=open('/private/tmp/nest-food-controls-ui-actor.lock','a+')
fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)

def state(sim):
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
        assert len(counts)==64 and not any(counts.values())
        scope=con.execute('SELECT actor,household FROM offline_scope WHERE id=1').fetchone()
        return {'actor':scope[0].lower() if scope else None,'household':scope[1].lower() if scope else None,'emptyJournals':64}
    finally: con.close()

def absolute(value,directory):
    if isinstance(value,str): return value.replace('__TESTROOT__',str(directory))
    if isinstance(value,list): return [absolute(v,directory) for v in value]
    if isinstance(value,dict): return {k:absolute(v,directory) for k,v in value.items()}
    return value

def prepare(scheme,derived):
    args=['xcodebuild','-project',str(ROOT/'apps/ios/Nest.xcodeproj'),'-scheme',scheme,'-configuration','Debug','-destination','platform=iOS Simulator,id='+PRIMARY,'-derivedDataPath',str(derived),'-clonedSourcePackagesDirPath',str(UI/'SourcePackages'),'-xcconfig','/private/tmp/nest-swiftui-test.xcconfig','-parallel-testing-enabled','NO','CODE_SIGNING_ALLOWED=YES','CODE_SIGN_IDENTITY=-','build-for-testing']
    with (OUT/(scheme+'-prepare.log')).open('w') as log:
        result=subprocess.run(args,stdout=log,stderr=subprocess.STDOUT)
    assert result.returncode==0, 'Inspect protected prepare log'
    app=derived/'Build/Products/Debug-iphonesimulator/Nest.app'
    info=plistlib.loads((app/'Info.plist').read_bytes())
    assert info['NEST_API_URL']=='https://nest-test-api-drrius-projects.vercel.app'
    assert info['NEST_SUPABASE_URL']=='https://tkjixmujjoustdiedfmw.supabase.co'
    assert info['NEST_PUSH_ENABLED']=='false'
    subprocess.run(['codesign','--verify','--deep','--strict',str(app)],check=True,capture_output=True)
    plans=list((derived/'Build/Products').glob(scheme+'_*.xctestrun')); assert len(plans)==1
    return absolute(plistlib.loads(plans[0].read_bytes()),plans[0].parent)

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



def database(sim):
    container=Path(subprocess.check_output(['xcrun','simctl','get_app_container',sim,'ch.drrius.nest','data'],text=True).strip())
    files=list((container/'Library/Application Support').glob('nest-offline-*.sqlite'));assert len(files)==1
    return sqlite3.connect('file:'+str(files[0])+'?mode=ro',uri=True)

def owned_journal(sim):
    con=database(sim)
    try:
        actor=ACTOR if sim==PRIMARY else PEER
        rows=con.execute('SELECT actor,household,body FROM renewal_requests').fetchall()
        assert len(rows)==1 and rows[0][0].lower()==actor and rows[0][1].lower()==HOUSEHOLD
        value=json.loads(rows[0][2]); receipt=value['result']['receipt']
        assert value['result']['status']=='recorded' and not value['cancellationRequested']
        assert receipt['actorId'].lower()==actor and receipt['householdId'].lower()==HOUSEHOLD
        assert receipt['command']==value['command']
        assert receipt['operationId'].lower()==value['command']['operationId'].lower()
        assert receipt['renewal']['renewalId'].lower()==value['command']['renewalId'].lower()
        return value
    finally:con.close()

def export(key):
    subprocess.run(['xcrun','xcresulttool','export','attachments','--path',str(OUT/key/'result.xcresult'),'--output-path',str(OUT/key/'attachments')],check=True,capture_output=True)

def sdk_read(key,sim,phase,receipt):
    renewal=receipt['renewal'];command=receipt['command']
    env={'NEST_QA_NATIVE_RENEWAL_READ':'20261006','NEST_QA_RENEWAL_NAME':'Test Alex' if sim==PRIMARY else 'Test Sam','NEST_QA_RENEWAL_PHASE':phase,'NEST_QA_RENEWAL_ID':renewal['renewalId'],'NEST_QA_RENEWAL_DATE':renewal['fields']['renewalOn'],'NEST_QA_RENEWAL_REVISION':renewal['revision'].lower()}
    if receipt['actorId'].lower()==(ACTOR if sim==PRIMARY else PEER):
        env['NEST_QA_RENEWAL_OPERATION']=command['operationId']
        if command.get('expectedRevision'):env['NEST_QA_RENEWAL_BASELINE_REVISION']=command['expectedRevision']
    checked(key,sim,'NestAppTests','HostedNativeRenewalReadTests/testBothMembersReadOwnedRenewalCanonicalState',env)
    export(key)
    rows=[]
    for path in (OUT/key/'attachments').glob('*.json'):
        value=json.loads(path.read_text())
        if isinstance(value,dict) and {'actor','household','phase','renewals','renewal'}.issubset(value):rows.append(value)
    assert len(rows)==1
    value=rows[0];assert value['renewal']==renewal
    (OUT/key/'native-read.json').write_text(json.dumps(value,indent=2)+'\n')
    return value

def checked(key,sim,suite,method,env):
    row=run(key,sim,suite,method,env)
    assert row['passed']==1 and row['failed']==row['skipped']==0 and row['exitCode']==0, 'Inspect result before any further positive action'



saved=owned_journal(PRIMARY)
assert saved==json.loads((OUT/'remove-saved-request.json').read_text())
receipt=saved['result']['receipt'];renewal=receipt['renewal']
assert renewal['renewalId'].lower()=='17919246-d8ec-4402-b301-da1149d1cc35' and renewal['removed']
assert receipt['operationId'].lower()=='513a4d4b-8d09-492d-aff6-3875db3df9e6'
assert state(PARTNER)=={'actor':PEER,'household':HOUSEHOLD,'emptyJournals':64}
source={str(p.relative_to(ROOT/'apps/ios')):hashlib.sha256(p.read_bytes()).hexdigest() for folder in ['Nest','AppTests','UITests','Nest.xcodeproj'] for p in (ROOT/'apps/ios'/folder).rglob('*') if p.is_file() and 'xcuserdata' not in p.parts and p.name!='README.md'}
old=json.loads((OUT/'source-inputs-private.json').read_text())
assert all(source[k]==v for k,v in old.items() if k.startswith(('Nest/','AppTests/','Nest.xcodeproj/')))
sdk_plan=plistlib.loads((OUT/'sdk-plan-private.plist').read_bytes())
ui_plan=plistlib.loads((OUT/'cold-selection-ui-plan-private.plist').read_bytes())
results=json.loads((OUT/'results.json').read_text())
success=False
awake=subprocess.Popen(['caffeinate','-dimsu','-t','1200'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
    (OUT/'removal-cleanup-started.json').write_text(json.dumps({'removalReplayed':False,'positiveCommandsAlreadyRecorded':3,'correction':'empty-list check after normal Done in dedicated native list test'})+'\n')
    a=sdk_read('remove-alex-read',PRIMARY,'removed',receipt)
    b=sdk_read('remove-sam-read',PARTNER,'removed',receipt)
    assert a['renewal']==b['renewal'] and a['renewals']==b['renewals']==[]
    import shutil
    shutil.copy2(OUT/'NestAccessibility-prepare.log',OUT/'NestAccessibility-before-final-prepare.log')
    ui_plan=prepare('NestAccessibility',UI)
    shutil.copy2(OUT/'NestAccessibility-prepare.log',OUT/'NestAccessibility-final-prepare.log')
    (OUT/'final-source-inputs-private.json').write_text(json.dumps(source,sort_keys=True))
    env={'NEST_QA_RENEWAL_CRUD':'20261006','NEST_QA_RENEWAL_NAME':'Test Alex','NEST_QA_RENEWAL_ACTION':'clear_recorded','NEST_QA_RENEWAL_PREFLIGHT':'owned_exact_record','NEST_QA_RENEWAL_ID':renewal['renewalId'],'NEST_QA_RENEWAL_RECORDED_TITLE':renewal['fields']['title'],'NEST_QA_RENEWAL_RECORDED_REMOVAL':'true'}
    checked('remove-done-ui',PRIMARY,'NestAccessibilityTests','NativeRenewalCrudTests/testClearOnlyRecordedOwnedRequest',env)
    assert state(PRIMARY)=={'actor':ACTOR,'household':HOUSEHOLD,'emptyJournals':64}
    assert state(PARTNER)=={'actor':PEER,'household':HOUSEHOLD,'emptyJournals':64}
    for key,sim,name in [('alex',PRIMARY,'Test Alex'),('sam',PARTNER,'Test Sam')]:
        env={'NEST_QA_RENEWAL_CRUD':'20261006','NEST_QA_RENEWAL_NAME':name,'NEST_QA_RENEWAL_ACTION':'read_baseline'}
        checked(key+'-restored-ui',sim,'NestAccessibilityTests','NativeRenewalCrudTests/testReadBaselineRenewalList',env)
    success=True
finally:
    awake.terminate();awake.wait()
    restoration={'scopes':{},'positiveCommandsRecorded':3,'broadRowDigestsVerified':False,'retainedHistoricalTitleAbsenceVerified':False,'originalInterruptedDraftExplicitDiscardVerified':False}
    for sim in [PRIMARY,PARTNER]:
        subprocess.run(['xcrun','simctl','ui',sim,'content_size','large'],check=True)
        subprocess.run(['xcrun','simctl','ui',sim,'appearance','light'],check=True)
        try:restoration['scopes'][sim]=state(sim)
        except Exception:restoration['scopes'][sim]={'emptyJournals':False,'inspectSavedRequestBeforeRecovery':True}
    (OUT/'final-terminal.json').write_text(json.dumps({'success':success,'inspectBeforeResuming':not success,'removalReplayed':False,'positiveCommandsRecorded':3},indent=2)+'\n')
    (OUT/'final-restoration.json').write_text(json.dumps(restoration,indent=2)+'\n')
print('Final cleanup terminal',flush=True)
