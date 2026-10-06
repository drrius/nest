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
        if allow_owned:expected['renewal_reminder_requests']=1
        assert counts==expected
        scope=con.execute('SELECT actor,household FROM offline_scope WHERE id=1').fetchone()
        return {'actor':scope[0].lower() if scope else None,'household':scope[1].lower() if scope else None,'emptyJournals':sum(value==0 for value in counts.values()),'ownedReminderRequest':counts['renewal_reminder_requests']}
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

def saved_request():
    container=Path(subprocess.check_output(['xcrun','simctl','get_app_container',PRIMARY,'ch.drrius.nest','data'],text=True).strip())
    database=next((container/'Library/Application Support').glob('nest-offline-*.sqlite'))
    con=sqlite3.connect('file:'+str(database)+'?mode=ro',uri=True)
    try:
        rows=con.execute('SELECT body FROM renewal_reminder_requests WHERE lower(actor)=? AND lower(household)=?',(ACTOR,HOUSEHOLD)).fetchall()
        assert len(rows)<=1
        return json.loads(rows[0][0]) if rows else None
    finally:con.close()

def assert_saved(saved):
    assert saved is not None and not saved['cancellationRequested']
    assert saved['renewal']==request['result']['receipt']['renewal']
    command=saved['command'];settings=command['settings']
    assert command['renewalId'].lower()==ID and command['expectedRenewalRevision'].lower()==REV
    assert command.get('expectedRevision') is None and saved['baseline'].get('reminder') is None
    assert settings=={'anchor':'renewal','delivery':{'enabled':True,'recipientIds':sorted([ACTOR.upper(),PEER.upper()]),'localTime':'09:00','daysBefore':1}}
    assert saved['result']['status']=='recorded'
    receipt=saved['result']['receipt'];reminder=receipt['reminder']
    assert receipt['command']==command and receipt['operationId']==command['operationId']
    assert receipt['actorId'].lower()==ACTOR and receipt['householdId'].lower()==HOUSEHOLD
    assert reminder['settings']==settings and reminder['reviewedRenewalRevision'].lower()==REV
    assert reminder['updatedBy'].lower()==ACTOR

def read_recorded(key,sim,name,saved):
    env={'NEST_QA_ACTIVE_RENEWAL_REMINDER_RECEIPT_READ':'20261006','NEST_QA_ACTIVE_RENEWAL_REMINDER_RECEIPT_NAME':name,'NEST_QA_ACTIVE_RENEWAL_TITLE':TITLE,'NEST_QA_RENEWAL_REMINDER_RECEIPT_PHASE':'saved','NEST_QA_RENEWAL_REMINDER_REQUEST_JSON':json.dumps(saved),'NEST_QA_ACTIVE_RENEWAL_BASELINE_JSON':json.dumps(baseline)}
    row=run(key,sim,'NestAppTests','HostedActiveRenewalReminderReceiptReadTests/testGETOnlySharedCanonicalAndPrivateImmutableOperation',env);export(key)
    records=[]
    for file in (OUT/key/'attachments').glob('*.json'):
        value=json.loads(file.read_text())
        if isinstance(value,dict) and {'actor','household','canonical','operationRecovery'}.issubset(value):records.append(value)
    if records:(OUT/key/'native-read.json').write_text(json.dumps(records[0],indent=2)+'\n')
    require_pass(row);assert len(records)==1
    return records[0]

OUT=Path('/private/tmp/nest-active-renewal-reminder-save-reads-20261006');assert not OUT.exists();OUT.mkdir(mode=0o700)
TITLE='Nest QA reminder 0610-3f88';ID='23435fe5-5b08-48cd-b0fb-03f0e2d49690';REV='6610131c-d4d9-42fc-89f2-42ffe0a7b777'
lock=open('/private/tmp/nest-food-controls-ui-actor.lock','a+');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
EXCLUDED.add('renewal_read_snapshots')
REFERENCE=Path('/private/tmp/nest-active-renewal-reminder-save-20261006')
saved=json.loads((REFERENCE/'owned-reminder-request.json').read_text())
request=json.loads((REFERENCE/'expected-create-request.json').read_text())
baseline=json.loads((REFERENCE/'phase1-canonical-baseline.json').read_text())
assert_saved(saved)
assert saved['command']['operationId'].lower()=='32102900-3d5a-4aa6-9d41-647dab7cf63c'
assert saved['result']['receipt']['reminder']['revision'].lower()=='30203c42-0138-4472-a03a-374b99bbb9d6'
assert saved_request()==saved
before={'alex':state(PRIMARY,True),'sam':state(PARTNER)}
assert before['alex']['emptyJournals']==63 and before['sam']['emptyJournals']==64
frozen=json.loads((REFERENCE/'source-input-hashes.json').read_text())
source={str(p.relative_to(ROOT/'apps/ios')):hashlib.sha256(p.read_bytes()).hexdigest() for folder in ['Nest','AppTests','UITests','Tests','Nest.xcodeproj'] for p in (ROOT/'apps/ios'/folder).rglob('*') if p.is_file() and 'xcuserdata' not in p.parts and p.name!='README.md'}
assert source==frozen and len(source)==1113
(OUT/'source-input-hashes.json').write_text(json.dumps(source,sort_keys=True)+'\n')
(OUT/'source-pinning.json').write_text(json.dumps({'ExecutedSourceCommit':'848fcd7cbfc217bb05d566cec2beb0b5f24477f5','NativeInputs':1113,'SDKReusedExactSource':True,'POSTBudget':0},indent=2)+'\n')
(OUT/'expected-reminder-request.json').write_text(json.dumps(saved,indent=2)+'\n')
(OUT/'phase1-canonical-baseline.json').write_text(json.dumps(baseline,indent=2)+'\n')
plans=list((SDK/'Build/Products').glob('Nest_*.xctestrun'));assert len(plans)==1
sdk_plan=absolute(plistlib.loads(plans[0].read_bytes()),plans[0].parent)
results=[];complete=False
awake=subprocess.Popen(['caffeinate','-dimsu','-t','1200'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
 print('GET-only exact recorded op32102900 owner and partner reads; no UI/POST',flush=True)
 a=read_recorded('alex-recorded',PRIMARY,'Test Alex',saved)
 b=read_recorded('sam-recorded',PARTNER,'Test Sam',saved)
 assert a['canonical']==b['canonical']==baseline and a['reminder']==b['reminder']
 assert a['operationRecovery']==saved['result']
 assert b['operationRecovery']['status']=='unresolved' and b['operationRecovery'].get('receipt') is None
 complete=True
finally:
 for file in OUT.glob('*/selected.xctestrun'):file.unlink()
 awake.terminate();awake.wait()
 assert saved_request()==saved
 after={'alex':state(PRIMARY,True),'sam':state(PARTNER)};assert before==after
 (OUT/'restoration.json').write_text(json.dumps({'before':before,'after':after,'exactOwnedRequestRetained':True,'selectedPlansRemoved':True,'scopedCaffeinateStopped':True},indent=2)+'\n')
 (OUT/'terminal.json').write_text(json.dumps({'bothRecordedReadsPassed':complete,'UIExecuted':False,'POSTs':0,'ReminderSaveReplays':0,'Removes':0,'DoneNotExecuted':True},indent=2)+'\n')
