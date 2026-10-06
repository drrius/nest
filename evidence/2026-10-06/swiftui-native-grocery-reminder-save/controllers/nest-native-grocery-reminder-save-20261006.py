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
def state(sim, pending=False):
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
        expected=1 if pending else 0
        assert counts.get('grocery_reminder_requests')==expected and sum(counts.values())==expected
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

OUT=Path('/private/tmp/nest-native-grocery-reminder-save-20261006');assert not OUT.exists();OUT.mkdir(mode=0o700)
lock=open('/private/tmp/nest-food-controls-ui-actor.lock','a+');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
EXCLUDED.add('renewal_read_snapshots')
assert state(PRIMARY)=={'actor':ACTOR,'household':HOUSEHOLD,'emptyJournals':64}
assert state(PARTNER)=={'actor':PEER,'household':HOUSEHOLD,'emptyJournals':64}
results=[];requests=[];finished=False
budget={'maximumSavePOSTs':2,'saveMethodInvocations':[],'recordedOperations':[],'automaticReplays':0}
awake=subprocess.Popen(['caffeinate','-dimsu','-t','1200'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
def export(key):
    case=OUT/key
    subprocess.run(['xcrun','xcresulttool','export','attachments','--path',str(case/'result.xcresult'),'--output-path',str(case/'attachments')],check=True,capture_output=True)
def succeeded(row):
    return row['passed']==1 and row['failed']==row['skipped']==0 and row['exitCode']==0
def save_budget():
    (OUT/'command-budget.json').write_text(json.dumps(budget,indent=2)+'\n')
def journal():
    container=Path(subprocess.check_output(['xcrun','simctl','get_app_container',PRIMARY,'ch.drrius.nest','data'],text=True).strip())
    files=list((container/'Library/Application Support').glob('nest-offline-*.sqlite'));assert len(files)==1
    con=sqlite3.connect('file:'+str(files[0])+'?mode=ro',uri=True)
    try:
        scope=con.execute('SELECT actor,household FROM offline_scope WHERE id=1').fetchone()
        assert tuple(x.lower() for x in scope)==(ACTOR,HOUSEHOLD)
        rows=con.execute('SELECT body FROM grocery_reminder_requests WHERE actor=? AND household=?',scope).fetchall()
        assert len(rows)<=1
        if not rows:return None
        value=json.loads(rows[0][0]);command=value['command'];baseline=value['baseline']
        assert command['itemId'].lower()==ITEM and baseline['grocery']['itemId'].lower()==ITEM
        assert baseline['householdId'].lower()==HOUSEHOLD and baseline['grocery']['name']=='QA rice'
        assert baseline['grocery']['quantity']=='100'
        assert baseline['grocery']['unit']=='g'
        assert baseline['itemVersion']=='1'
        assert not baseline['grocery']['checked'] and not value['cancellationRequested']
        assert command['settings']['localDate']=='2026-10-07' and command['settings']['localTime']=='08:00'
        assert {x.lower() for x in command['settings']['recipientIds']}=={ACTOR,PEER}
        result=value.get('result')
        if result and result['status']=='recorded':
            receipt=result['receipt'];assert receipt['command']==command
            assert receipt['actorId'].lower()==ACTOR and receipt['householdId'].lower()==HOUSEHOLD
            assert receipt['operationId'].lower()==command['operationId'].lower()
        return value
    finally:con.close()
def observe(key,sim,phase):
    name='Test Alex' if sim==PRIMARY else 'Test Sam'
    env={'NEST_QA_GROCERY_REMINDER_RECEIPTS':'20261006','NEST_QA_GROCERY_REMINDER_NAME':name,'NEST_QA_GROCERY_REMINDER_ID':ITEM,'NEST_QA_REMINDER_RECEIPT_PHASE':phase,'NEST_QA_REMINDER_REQUESTS_JSON':json.dumps(requests)}
    row=run(key,sim,'NestAppTests','HostedGroceryReminderReceiptReadTests/testReadOwnedCanonicalAndOwnerImmutableReceipts',env)
    export(key)
    values=[]
    for file in (OUT/key/'attachments').glob('*.json'):
        value=json.loads(file.read_text())
        if isinstance(value,dict) and {'actor','household','context','ownerRecoveries'}.issubset(value):values.append(value)
    if values:
        assert len(values)==1
        (OUT/key/'native-read.json').write_text(json.dumps(values[0],indent=2)+'\n')
    assert succeeded(row),'Inspect read-only observer before any further action'
    return values[0]
def ui(key,action,method,extra=None):
    env={'NEST_QA_GROCERY_REMINDER_SAVE':'20261006','NEST_QA_GROCERY_REMINDER_NAME':'Test Alex','NEST_QA_GROCERY_REMINDER_ID':ITEM,'NEST_QA_REMINDER_SAVE_ACTION':action,'NEST_QA_API_ORIGIN':'https://nest-test-api-drrius-projects.vercel.app','NEST_QA_SUPABASE_ORIGIN':'https://tkjixmujjoustdiedfmw.supabase.co','NEST_QA_PUSH_ENABLED':'false'}
    env.update(extra or {})
    row=run(key,PRIMARY,'NestAccessibilityTests','NativeGroceryReminderSaveTests/'+method,env)
    export(key)
    return row
ITEM='d24cc35d-a6ae-44c6-9780-e28f8723d44d'
try:
    for sim in [PRIMARY,PARTNER]:
        subprocess.run(['xcrun','simctl','ui',sim,'content_size','large'],check=True)
        subprocess.run(['xcrun','simctl','ui',sim,'appearance','light'],check=True)
    sdk_plan=prepare('Nest',SDK);ui_plan=prepare('NestAccessibility',UI)
    source={str(p.relative_to(ROOT/'apps/ios')):hashlib.sha256(p.read_bytes()).hexdigest() for folder in ['Nest','AppTests','UITests','Tests','Nest.xcodeproj'] for p in (ROOT/'apps/ios'/folder).rglob('*') if p.is_file() and 'xcuserdata' not in p.parts and p.name!='README.md'}
    (OUT/'source-input-hashes.json').write_text(json.dumps(source,sort_keys=True)+'\n')
    beforeA=observe('alex-before',PRIMARY,'baseline');beforeB=observe('sam-before',PARTNER,'baseline')
    assert beforeA['context']==beforeB['context'] and journal() is None
    for phase,method in [('enabled','testEnableBothRecipientsOnceAndLeaveRecordedRequest'),('disabled','testDisableOwnedReminderOnceAndLeaveRecordedRequest')]:
        assert len(budget['saveMethodInvocations'])<2 and journal() is None
        extra={}
        if requests:extra['NEST_QA_REMINDER_EXPECTED_REVISION']=requests[0]['result']['receipt']['reminder']['revision']
        budget['saveMethodInvocations'].append(phase);save_budget()
        row=ui(phase+'-save','enable' if phase=='enabled' else 'disable',method,extra)
        saved=journal()
        (OUT/(phase+'-saved-request.json')).write_text(json.dumps(saved,indent=2)+'\n')
        if saved is None:
            observe(phase+'-alex-no-request',PRIMARY,'baseline');observe(phase+'-sam-no-request',PARTNER,'baseline')
            raise AssertionError('UI failed before staging; no blind Save rerun')
        requests.append(saved)
        if (saved.get('result') or {}).get('status')!='recorded':
            observe(phase+'-alex-inspect',PRIMARY,'inspect')
            raise AssertionError('Exact pending intent inspected; no further Save')
        operation=saved['command']['operationId'];budget['recordedOperations'].append(operation);save_budget()
        print(json.dumps({'recordedPhase':phase,'operationId':operation,'revision':saved['result']['receipt']['reminder']['revision']}),flush=True)
        assert saved['command']['settings']['enabled']==(phase=='enabled')
        state(PRIMARY,pending=True);state(PARTNER)
        a=observe(phase+'-alex',PRIMARY,phase);b=observe(phase+'-sam',PARTNER,phase)
        assert a['context']==b['context'] and a['context']['grocery']==beforeA['context']['grocery']
        assert succeeded(row),'Original command read back; stop dependent actions after failed UI observer'
        done=ui(phase+'-done','finish_'+phase,'testFinishExactRecordedRequestThroughDone',{'NEST_QA_REMINDER_OPERATION':operation})
        assert succeeded(done) and journal() is None
        state(PRIMARY);state(PARTNER)
    finalA=observe('alex-final',PRIMARY,'final');finalB=observe('sam-final',PARTNER,'final')
    assert finalA['context']==finalB['context']
    assert finalA['context']['reminder']['settings']['enabled'] is False
    assert finalA['context']['grocery']==beforeA['context']['grocery']
    assert len(budget['recordedOperations'])==2
    finished=True
finally:
    save_budget()
    for case in OUT.iterdir():
        if case.is_dir():(case/'selected.xctestrun').unlink(missing_ok=True)
    for key,sim in [('alex',PRIMARY),('sam',PARTNER)]:
        subprocess.run(['xcrun','simctl','ui',sim,'content_size','large'],check=True)
        subprocess.run(['xcrun','simctl','ui',sim,'appearance','light'],check=True)
        subprocess.run(['xcrun','simctl','launch',sim,'ch.drrius.nest'],check=True,capture_output=True)
        time.sleep(4)
        subprocess.run(['xcrun','simctl','io',sim,'screenshot',str(OUT/(key+'-restored-today.png'))],check=True,capture_output=True)
    awake.terminate();awake.wait()
    pending=journal() is not None
    (OUT/'restoration.json').write_text(json.dumps({'alex':state(PRIMARY,pending=pending),'sam':state(PARTNER),'ownedPendingRequestRetained':pending,'appearance':'light','contentSize':'large','stableAPI':True,'pushEnabled':False,'workersActivationRequested':False},indent=2)+'\n')
    (OUT/'terminal.json').write_text(json.dumps({'completedTwoCommandsAndNormalDone':finished,'readOnlyRecoveryRequired':not finished,'directJournalDeletion':False},indent=2)+'\n')
print('Native owned two-Save reminder controller terminal',flush=True)
