from pathlib import Path
import fcntl,hashlib,json,os,plistlib,sqlite3,subprocess,time
os.umask(0o077)
PRIMARY='C3ABC0D4-CFD4-4F23-8CC3-0E542014803A'
PARTNER='CA0BCEDE-A297-493A-8921-9E31F8B65783'
ACTOR='791f7261-6c9d-4061-9c8a-57aa6e0b0200'
PEER='e5f80cfd-b69a-4aa0-a267-75784e943676'
HOUSEHOLD='be772ffd-3ab5-41d5-8438-647a79a553da'
ROOT=Path('/private/tmp/nest-current-qa-82a')
SDK=Path('/private/tmp/nest-swiftui-partner-sdk-20261005')
UI=Path('/private/tmp/nest-swiftui-accessibility-20261005')
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
        if allow_owned:expected['renewal_requests']=1
        assert counts==expected
        scope=con.execute('SELECT actor,household FROM offline_scope WHERE id=1').fetchone()
        return {'actor':scope[0].lower() if scope else None,'household':scope[1].lower() if scope else None,'emptyJournals':sum(value==0 for value in counts.values()),'ownedRenewalRequest':counts['renewal_requests']}
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
    assert info['CFBundleVersion']=='19'
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


def details(sim):
    container=Path(subprocess.check_output(['xcrun','simctl','get_app_container',sim,'ch.drrius.nest','data'],text=True).strip())
    files=list((container/'Library/Application Support').glob('nest-offline-*.sqlite'));assert len(files)==1
    database=files[0];info=database.stat()
    con=sqlite3.connect('file:'+str(database)+'?mode=ro',uri=True)
    try:
        names={r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        counts={table:con.execute('SELECT COUNT(*) FROM "'+table+'"').fetchone()[0] for table in sorted(EXCLUDED) if table in names}
        scope=con.execute('SELECT actor,household,lease FROM offline_scope WHERE id=1').fetchone()
        return {'state':state(sim),'containerIdentity':container.name,'databaseName':database.name,'inode':info.st_ino,'device':info.st_dev,'snapshotCounts':counts,'lease':scope[2] if scope else None}
    finally:con.close()

def export(key):
    case=OUT/key
    subprocess.run(['xcrun','xcresulttool','export','attachments','--path',str(case/'result.xcresult'),'--output-path',str(case/'attachments')],check=True,capture_output=True)

def observe(key,sim,name,phase,request=None):
    env={'NEST_QA_ACTIVE_RENEWAL_READ':'20261006','NEST_QA_ACTIVE_RENEWAL_NAME':name,'NEST_QA_ACTIVE_RENEWAL_TITLE':TITLE,'NEST_QA_ACTIVE_RENEWAL_PHASE':phase}
    if baseline is not None:env['NEST_QA_ACTIVE_RENEWAL_BASELINE_JSON']=json.dumps(baseline)
    if request is not None:env['NEST_QA_ACTIVE_RENEWAL_REQUEST_JSON']=json.dumps(request)
    row=run(key,sim,'NestAppTests','HostedActiveRenewalReminderReadTests/testGETOnlyFreshRenewalBaselineAndExactCreatedReceipt',env)
    export(key)
    records=[]
    for file in (OUT/key/'attachments').glob('*.json'):
        value=json.loads(file.read_text())
        if isinstance(value,dict) and {'actor','household','phase','canonical','renewalPages'}.issubset(value):records.append(value)
    if records:
        assert len(records)==1
        (OUT/key/'native-read.json').write_text(json.dumps(records[0],indent=2)+'\n')
    require_pass(row)
    assert len(records)==1
    return records[0]

def require_pass(row):
    assert [row['exitCode'],row['passed'],row['failed'],row['skipped']]==[0,1,0,0],'Stop first failure; never replay Create'

def owned_request():
    container=Path(subprocess.check_output(['xcrun','simctl','get_app_container',PRIMARY,'ch.drrius.nest','data'],text=True).strip())
    files=list((container/'Library/Application Support').glob('nest-offline-*.sqlite'));assert len(files)==1
    con=sqlite3.connect('file:'+str(files[0])+'?mode=ro',uri=True)
    try:
        rows=con.execute('SELECT body FROM renewal_requests WHERE lower(actor)=? AND lower(household)=?',(ACTOR,HOUSEHOLD)).fetchall()
        if not rows:return None
        assert len(rows)==1
        request=json.loads(rows[0][0])
        assert request['command']['fields']=={'title':TITLE,'renewalOn':'2026-10-07','noticeDays':0,'responsibleId':None,'recurringRuleId':None}
        assert request.get('baseline') is None and request['command'].get('expectedRevision') is None
        assert not request['cancellationRequested']
        assert request['command']['renewalId'].lower()!='17919246-d8ec-4402-b301-da1149d1cc35'
        return request
    finally:con.close()

def assert_receipt(request):
    result=request['result'];receipt=result['receipt']
    assert result['status']=='recorded'
    assert receipt['actorId'].lower()==ACTOR and receipt['householdId'].lower()==HOUSEHOLD
    assert receipt['command']==request['command']
    assert receipt['operationId'].lower()==request['command']['operationId'].lower()
    assert receipt['renewal']['renewalId'].lower()==request['command']['renewalId'].lower()
    assert not receipt['renewal']['removed']

OUT=Path('/private/tmp/nest-active-renewal-phase1-released-20261006');assert not OUT.exists();OUT.mkdir(mode=0o700)
TITLE='Nest QA reminder 0610-3f88'
lock=open('/private/tmp/nest-food-controls-ui-actor.lock','a+');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
EXCLUDED.add('renewal_read_snapshots')
before={'alex':state(PRIMARY),'sam':state(PARTNER)}
durable_before={'alex':details(PRIMARY),'sam':details(PARTNER)}
assert before['alex']=={'actor':ACTOR,'household':HOUSEHOLD,'emptyJournals':64,'ownedRenewalRequest':0}
assert before['sam']=={'actor':PEER,'household':HOUSEHOLD,'emptyJournals':64,'ownedRenewalRequest':0}
results=[];baseline=None;request=None;created=False;finished=False
awake=subprocess.Popen(['caffeinate','-dimsu','-t','1200'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
    subprocess.run(['tar','-xf','/private/tmp/nest-active-renewal-phase1-released-source.tar','-C',str(ROOT)],check=True)
    frozen=json.loads(Path('/private/tmp/nest-active-renewal-phase1-released-inputs.json').read_text())
    source={str(p.relative_to(ROOT/'apps/ios')):hashlib.sha256(p.read_bytes()).hexdigest() for folder in ['Nest','AppTests','UITests','Tests','Nest.xcodeproj'] for p in (ROOT/'apps/ios'/folder).rglob('*') if p.is_file() and 'xcuserdata' not in p.parts and p.name!='README.md'};assert source==frozen and len(source)==1110
    (OUT/'source-input-hashes.json').write_text(json.dumps(source,sort_keys=True)+'\n')
    (OUT/'source-pinning.json').write_text(json.dumps({'ExecutedSourceCommit':'9e752368704743d43f708d0c86feed0aea90ff6e','AllNativeInputs':1110,'SDKAndUIRebuilt':True,'BuildNumber':'19','CreatePOSTBudget':1,'ReminderSaveBudget':0,'RemoveBudget':0},indent=2)+'\n')
    print('FROZEN9e752368/all1110; SDK build starts; Create budget1, all other writes0',flush=True)
    sdk_plan=prepare('Nest',SDK)
    first=observe('alex-before',PRIMARY,'Test Alex','baseline');baseline=first['canonical']
    second=observe('sam-before',PARTNER,'Test Sam','baseline')
    assert baseline==second['canonical'] and not first['renewalPages'][0]['renewals']
    (OUT/'baseline.json').write_text(json.dumps(baseline,indent=2)+'\n')
    print('Both baseline reads PASS; preparing UI before ONE Create',flush=True)
    ui_plan=prepare('NestAccessibility',UI)
    subprocess.run(['xcrun','simctl','ui',PRIMARY,'content_size','large'],check=True)
    subprocess.run(['xcrun','simctl','ui',PRIMARY,'appearance','light'],check=True)
    env={'NEST_QA_ACTIVE_RENEWAL_UI':'20261006','NEST_QA_ACTIVE_RENEWAL_ACTION':'create_once','NEST_QA_ACTIVE_RENEWAL_NAME':'Test Alex','NEST_QA_ACTIVE_RENEWAL_TITLE':TITLE,'NEST_QA_ACTIVE_RENEWAL_PHASE_ONE_BUDGET':'one_create_only','NEST_QA_ACTIVE_RENEWAL_PREFLIGHT':'exact_absent_baseline','NEST_QA_API_ORIGIN':'https://nest-test-api-drrius-projects.vercel.app','NEST_QA_SUPABASE_ORIGIN':'https://tkjixmujjoustdiedfmw.supabase.co','NEST_QA_PUSH_ENABLED':'false'}
    marker=OUT/'create-started.json';assert not marker.exists();marker.write_text(json.dumps({'at':time.time(),'maximumCreatePOSTs':1,'repeatForbidden':True})+'\n')
    row=run('create',PRIMARY,'NestAccessibilityTests','NativeActiveRenewalReminderTests/testCreateFreshFutureRenewalExactlyOnceAndRetainReceipt',env);export('create')
    request=owned_request()
    if request is not None:(OUT/'owned-created-request.json').write_text(json.dumps(request,indent=2)+'\n')
    require_pass(row);assert request is not None;assert_receipt(request);created=True
    print(json.dumps({'ownedRenewal':request['command']['renewalId'],'operation':request['command']['operationId'],'recorded':True,'CreateBudgetConsumed':1}),flush=True)
    a=observe('alex-created',PRIMARY,'Test Alex','created',request)
    b=observe('sam-created',PARTNER,'Test Sam','created',request)
    assert a['canonical']==b['canonical']==baseline
    assert a['renewal']==b['renewal'] and a['reminder']==b['reminder']
    assert a['ownerRecovery']==request['result'] and b['ownerRecovery'] is None
    env.update({'NEST_QA_ACTIVE_RENEWAL_ACTION':'finish_created','NEST_QA_ACTIVE_RENEWAL_PREFLIGHT':'exact_recorded_request','NEST_QA_ACTIVE_RENEWAL_ID':request['command']['renewalId'],'NEST_QA_ACTIVE_RENEWAL_OPERATION':request['command']['operationId']})
    row=run('done',PRIMARY,'NestAccessibilityTests','NativeActiveRenewalReminderTests/testFinishExactCreatedRenewalThroughNormalDone',env);export('done');require_pass(row)
    assert owned_request() is None;finished=True
finally:
    if not finished:
        pending=owned_request()
        if pending is not None:(OUT/'owned-intent-at-stop.json').write_text(json.dumps(pending,indent=2)+'\n')
    for key in ['alex-before','sam-before','create','alex-created','sam-created','done']:(OUT/key/'selected.xctestrun').unlink(missing_ok=True)
    for key,sim in [('alex',PRIMARY),('sam',PARTNER)]:
        subprocess.run(['xcrun','simctl','ui',sim,'content_size','large'],check=True)
        subprocess.run(['xcrun','simctl','ui',sim,'appearance','light'],check=True)
        if finished:subprocess.run(['xcrun','simctl','launch',sim,'ch.drrius.nest'],check=True,capture_output=True)
        subprocess.run(['xcrun','simctl','io',sim,'screenshot',str(OUT/(key+'-terminal.png'))],check=True,capture_output=True)
    awake.terminate();awake.wait()
    pending=owned_request()
    after={'alex':state(PRIMARY,allow_owned=pending is not None),'sam':state(PARTNER)}
    durable_after={'alex':details(PRIMARY),'sam':details(PARTNER)}
    (OUT/'durable-database-observation.json').write_text(json.dumps({'before':durable_before,'after':durable_after,'containerRelocationAllowed':True,'ByteIdentityClaimed':False},indent=2)+'\n')
    if finished:
        for actor in ['alex','sam']:
            for key in ['databaseName','inode','device']:assert durable_after[actor][key]==durable_before[actor][key]
            for table,count in durable_before[actor]['snapshotCounts'].items():
                if table!='renewal_read_snapshots':assert durable_after[actor]['snapshotCounts'][table]==count
    (OUT/'restoration.json').write_text(json.dumps({'before':before,'after':after,'largeLight':True,'originalScopesUnchanged':all(before[k]['actor']==after[k]['actor'] and before[k]['household']==after[k]['household'] for k in before),'all64JournalsEmpty':all(value['emptyJournals']==64 for value in after.values()),'TodayRestorationObserved':finished,'selectedPlansRemoved':True,'scopedCaffeinateStopped':True},indent=2)+'\n')
    (OUT/'terminal.json').write_text(json.dumps({'CreatedRecorded':created,'DoneObserved':finished,'CreateAttempts':int((OUT/'create-started.json').exists()),'AdditionalWrites':0,'Replays':0,'StopFirstFailure':not finished},indent=2)+'\n')
print('Phase1 terminal; leave active fixture for root-reviewed next phase',flush=True)
