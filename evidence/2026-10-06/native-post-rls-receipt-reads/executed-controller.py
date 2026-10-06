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
OUT=Path('/private/tmp/nest-post-rls-receipt-reads-20261006')
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

def plan_from(derived,scheme):
 paths=list((derived/'Build/Products').glob(scheme+'_*.xctestrun'));assert len(paths)==1
 plan=absolute(plistlib.loads(paths[0].read_bytes()),paths[0].parent)
 suite='NestAppTests' if scheme=='Nest' else 'NestAccessibilityTests'
 info=plistlib.loads((derived/'Build/Products/Debug-iphonesimulator/Nest.app/Info.plist').read_bytes())
 assert info['NEST_API_URL']=='https://nest-test-api-drrius-projects.vercel.app' and info['NEST_SUPABASE_URL']=='https://tkjixmujjoustdiedfmw.supabase.co'
 assert info['NEST_PUSH_ENABLED']=='false' and info['CFBundleVersion']=='19'
 attested=json.loads((OUT/(scheme+'-build-attestation.json')).read_text())
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

lock=open('/private/tmp/nest-food-controls-ui-actor.lock','a+')
fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
assert not OUT.exists();OUT.mkdir(mode=0o700)
expected={'Nest-build-attestation.json': '47c0a3afb4f5d70175cba2ceae7503fd576cd78a8de630632b267d44b0796742', 'source-input-hashes.json': '6f1f31ac2c5ccd8b1f676b3c68b1e7fb4a9c6992bf8b7bd601403900b7211ca2', 'references.json': 'c687cd4f03f29246c1346e98a8919b92d102e53497e2acab3bb258078e939a3d', 'baseline.json': 'a26c0e860a280acd939e9d7c21c371098ed35cf596d73e9d647d5184b59ed85b', 'captured-reminder-request.json': '573857224223540c7b5cbd4652e64ff390a32d05f2ef8fb09171e3166e8defaf'}
for filename,value in expected.items():
 data=json.loads((ORIGINAL/filename).read_text())
 assert hashlib.sha256(json.dumps(data,sort_keys=True,separators=(',',':')).encode()).hexdigest()==value
 shutil.copy2(ORIGINAL/filename,OUT/filename)
references=json.loads((OUT/'references.json').read_text())
baseline=json.loads((OUT/'baseline.json').read_text())
saved=json.loads((OUT/'captured-reminder-request.json').read_text())
assert saved['command']['operationId'].lower()=='f23e5dfb-cc10-4199-a0f1-bc2cfcbd521c'
assert saved['result']['status']=='recorded' and not saved['cancellationRequested']
assert len(json.loads((OUT/'source-input-hashes.json').read_text()))==1122
sdk_plan=plan_from(SDK,'Nest');results=[]
before={'alex':state(PRIMARY),'sam':state(PARTNER)}
assert before['alex']['actor']==ACTOR and before['sam']['actor']==PEER
assert before['alex']['household']==before['sam']['household']==HOUSEHOLD
settings=ui_settings()
(OUT/'initial-ui-settings.json').write_text(json.dumps(settings,indent=2)+'\n')
(OUT/'source-pinning.json').write_text(json.dumps({'ExecutedSDKSource':SOURCE,'NativeInputs':1122,'ReusedImmutableSDK':True,'CurrentMirrorIsNotExecutedSource':True,'SDKProductHashesRevalidated':True,'SelectedPathsAndSigningOriginsVerified':True,'SaveInvocations':0,'UIAcceptanceMethods':0,'HostedRLSVersion':'20261006161050','HostedRLSName':'native_internal_rls'},indent=2)+'\n')
awake=subprocess.Popen(['caffeinate','-dimsu','-t','1200'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
passed=False
try:
 a=observe('alex-post-rls',PRIMARY,'Test Alex','saved',saved)
 b=observe('sam-post-rls',PARTNER,'Test Sam','saved',saved)
 assert a['canonical']==b['canonical']==baseline and a['reminder']==b['reminder']
 passed=True
finally:
 for path in OUT.glob('*/selected.xctestrun'):path.unlink()
 for sim in [PRIMARY,PARTNER]:
  for key,value in settings[sim].items():subprocess.run(['xcrun','simctl','ui',sim,key,value],check=True)
  subprocess.run(['xcrun','simctl','launch',sim,'ch.drrius.nest'],check=True,capture_output=True)
 time.sleep(10)
 for name,sim in [('alex',PRIMARY),('sam',PARTNER)]:subprocess.run(['xcrun','simctl','io',sim,'screenshot',str(OUT/(name+'-terminal-screen.png'))],check=True,capture_output=True)
 awake.terminate();awake.wait()
 after={'alex':state(PRIMARY),'sam':state(PARTNER)}
 assert after==before and ui_settings()==settings
 (OUT/'restoration.json').write_text(json.dumps({'before':before,'after':after,'all64Empty':True,'originalScopesUnchanged':True,'initialUISettingsRestored':True,'foregroundLaunchAfterTests':True,'ownedPlansRemoved':True,'scopedCaffeinateStopped':True},indent=2)+'\n')
 (OUT/'terminal.json').write_text(json.dumps({'BothPostRLSGETMethodsPassed':passed,'NativeSaveInvocations':0,'DoneInvocations':0,'UIAcceptanceMethods':0,'Replay':False},indent=2)+'\n')
print('GET-only post-RLS pair terminal',flush=True)
