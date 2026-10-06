from pathlib import Path
import importlib.util
resolver_path=Path("/private/tmp/nest-selected-test-products-20261006.py")
resolver_spec=importlib.util.spec_from_file_location("selected_test_products",resolver_path)
resolver=importlib.util.module_from_spec(resolver_spec)
resolver_spec.loader.exec_module(resolver)
import fcntl,hashlib,json,os,plistlib,sqlite3,subprocess,time,sys,uuid
os.umask(0o077)
PRIMARY='C3ABC0D4-CFD4-4F23-8CC3-0E542014803A'
PARTNER='CA0BCEDE-A297-493A-8921-9E31F8B65783'
ACTOR='791f7261-6c9d-4061-9c8a-57aa6e0b0200'
PEER='e5f80cfd-b69a-4aa0-a267-75784e943676'
HOUSEHOLD='be772ffd-3ab5-41d5-8438-647a79a553da'
ROOT=Path('/private/tmp/nest-current-qa-82a')
SDK=Path('/private/tmp/nest-active-bill-reminder-save-sdk-20261006')
UI=Path('/private/tmp/nest-active-bill-reminder-save-ui-20261006')
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
    needle='NativeActiveRecurringReminderSaveTests.swift' if scheme=='NestAccessibility' else 'HostedActiveRecurringReminderReceiptReadTests.swift'
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




def saved_request():
 container=Path(subprocess.check_output(['xcrun','simctl','get_app_container',PRIMARY,'ch.drrius.nest','data'],text=True).strip())
 database=next((container/'Library/Application Support').glob('nest-offline-*.sqlite'))
 con=sqlite3.connect('file:'+str(database)+'?mode=ro',uri=True)
 try:
  rows=con.execute('SELECT body FROM recurring_reminder_requests WHERE lower(actor)=? AND lower(household)=?',(ACTOR,HOUSEHOLD)).fetchall();assert len(rows)<=1
  return json.loads(rows[0][0]) if rows else None
 finally:con.close()

def validate_request(saved,recorded=False):
 assert saved is not None and not saved['cancellationRequested']
 command=saved['command'];context=saved['baseline'];settings=command['settings']
 uuid.UUID(command['operationId'])
 assert command['ruleId'].lower()==RULE and command['expectedRuleRevision'].lower()==REVISION
 assert command['expectedDueOn']=='2026-11-01' and 'expectedRevision' in command and command['expectedRevision'] is None
 assert context['rule']==references['ownedRule'] and context.get('reminder') is None and context['householdId'].lower()==HOUSEHOLD
 assert settings['enabled'] is True and sorted(a.lower() for a in settings['recipientIds'])==sorted([ACTOR,PEER])
 assert settings['localTime']=='09:00' and settings['daysBefore']==1
 if recorded:
  result=saved['result'];receipt=result['receipt'];reminder=receipt['reminder']
  assert result['status']=='recorded' and receipt['command']==command
  for value in [result,receipt]:
   assert value['actorId'].lower()==ACTOR and value['householdId'].lower()==HOUSEHOLD and value['operationId']==command['operationId']
  assert reminder['settings']==settings and reminder['updatedBy'].lower()==ACTOR and reminder['ruleId'].lower()==RULE
  assert reminder['reviewedRuleRevision'].lower()==REVISION and reminder['reviewedDueOn']=='2026-11-01'
  assert reminder['revision'] and reminder['revision']!=command['expectedRevision']

def settle_request():
 known=None
 for _ in range(31):
  candidate=saved_request()
  if candidate is not None:
   validate_request(candidate)
   state(PRIMARY,True)
   if known is not None:assert candidate['command']==known['command'] and candidate['baseline']==known['baseline']
   known=candidate
   (OUT/'captured-reminder-request.json').write_text(json.dumps(candidate,indent=2)+'\n')
   if (candidate.get('result') or {}).get('status')=='recorded':
    validate_request(candidate,True)
    return candidate
  else:state(PRIMARY)
  time.sleep(1)
 return known

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

def original_scope_check():
 value={'alex':state(PRIMARY),'sam':state(PARTNER)}
 assert value['alex']['actor']==ACTOR and value['sam']['actor']==PEER
 assert value['alex']['household']==value['sam']['household']==HOUSEHOLD
 assert saved_request() is None
 return value

def verify_inputs():
 frozen=json.loads(Path('/private/tmp/nest-active-bill-reminder-save-inputs.json').read_text())
 source={str(p.relative_to(ROOT/'apps/ios')):hashlib.sha256(p.read_bytes()).hexdigest() for folder in ['Nest','AppTests','UITests','Tests','Nest.xcodeproj'] for p in (ROOT/'apps/ios'/folder).rglob('*') if p.is_file() and 'xcuserdata' not in p.parts and p.name!='README.md'}
 assert source==frozen and len(source)==1122
 return source

SOURCE='216152554759c18d2a9c827dbbef9e11efc7147b'
RULE='f854e3a3-ffda-4eb7-86e5-d3933d938444';REVISION='528417a1-b97a-4be4-9e63-ad7c8c03c2be'
OUT=Path('/private/tmp/nest-active-bill-reminder-save-20261006')
MODE=sys.argv[1] if len(sys.argv)==2 else 'invalid'
assert MODE in ['--prepare-only','--execute-reviewed']
lock=open('/private/tmp/nest-food-controls-ui-actor.lock','a+');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
EXCLUDED.add('renewal_read_snapshots')
references=json.loads(Path('/private/tmp/nest-active-bill-reminder-save-references.json').read_text())
results=[];baseline=None;saved=None;save_passed=False;done_passed=False;after_reads=False
if MODE=='--prepare-only':
 assert not OUT.exists() and not SDK.exists() and not UI.exists();OUT.mkdir(mode=0o700)
 before=original_scope_check()
 awake=subprocess.Popen(['caffeinate','-dimsu','-t','1200'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 try:
  subprocess.run(['tar','-xf','/private/tmp/nest-active-bill-reminder-save-source.tar','-C',str(ROOT)],check=True)
  source=verify_inputs()
  (OUT/'source-input-hashes.json').write_text(json.dumps(source,sort_keys=True)+'\n')
  (OUT/'source-pinning.json').write_text(json.dumps({'PreparedSourceCommit':SOURCE,'NativeInputs':1122,'FreshSDKAndUIRequired':True,'POSTBudget':1,'PrepareOnlyHasNoAPIOrUITest':True},indent=2)+'\n')
  (OUT/'references.json').write_text(json.dumps(references,indent=2)+'\n')
  print('Prepare only: fresh SDK/UI compile216/all1122; NO API or native UI invocation',flush=True)
  prepare('Nest',SDK);prepare('NestAccessibility',UI)
  plan_from(SDK,'Nest');plan_from(UI,'NestAccessibility')
  assert original_scope_check()==before
  (OUT/'prepared.json').write_text(json.dumps({'Source':SOURCE,'Prepared':True,'NoAPIOrUIExecuted':True,'before':before},indent=2)+'\n')
 finally:awake.terminate();awake.wait()
 print('Fresh prepare-only terminal; execution awaits root guard handoff',flush=True)
else:
 prepared=json.loads((OUT/'prepared.json').read_text());assert prepared['Prepared'] and prepared['Source']==SOURCE
 assert not (OUT/'save-invocation-consumed.json').exists() and not (OUT/'results.json').exists()
 verify_inputs();sdk_plan=plan_from(SDK,'Nest');ui_plan=plan_from(UI,'NestAccessibility')
 before=original_scope_check()
 awake=subprocess.Popen(['caffeinate','-dimsu','-t','1200'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 try:
  a=observe('alex-before',PRIMARY,'Test Alex','before');baseline=a['canonical']
  (OUT/'baseline.json').write_text(json.dumps(baseline,indent=2)+'\n')
  b=observe('sam-before',PARTNER,'Test Sam','before');assert a['canonical']==b['canonical'] and a['reminder']==b['reminder']
  assert original_scope_check()==before
  subprocess.run(['xcrun','simctl','ui',PRIMARY,'content_size','large'],check=True);subprocess.run(['xcrun','simctl','ui',PRIMARY,'appearance','light'],check=True)
  env={'NEST_QA_ACTIVE_BILL_SAVE_UI':'20261006','NEST_QA_ACTIVE_BILL_NAME':'Test Alex','NEST_QA_ACTIVE_BILL_RULE_ID':RULE,'NEST_QA_ACTIVE_BILL_REVISION':REVISION,'NEST_QA_ACTIVE_BILL_DUE':'2026-11-01','NEST_QA_ACTIVE_BILL_REMINDER_ACTION':'save_once','NEST_QA_ACTIVE_BILL_POST_BUDGET':'1','NEST_QA_API_ORIGIN':'https://nest-test-api-drrius-projects.vercel.app','NEST_QA_SUPABASE_ORIGIN':'https://tkjixmujjoustdiedfmw.supabase.co','NEST_QA_PUSH_ENABLED':'false'}
  with (OUT/'save-invocation-consumed.json').open('x') as sent:json.dump({'ConsumedPermanentlyBeforeInvocation':True,'SaveInvocationBudget':1,'Source':SOURCE,'Rule':RULE,'time':time.time()},sent)
  row=run('native-save-once',PRIMARY,'NestAccessibilityTests','NativeActiveRecurringReminderSaveTests/testOneNativeBillReminderSave',env)
  saved=settle_request()
  subprocess.run(['xcrun','xcresulttool','export','attachments','--path',str(OUT/'native-save-once/result.xcresult'),'--output-path',str(OUT/'native-save-once/attachments')],check=True,capture_output=True)
  save_passed=[row['exitCode'],row['passed'],row['failed'],row['skipped']]==[0,1,0,0]
  assert saved is not None,'Consumed invocation: preserve failure, no Save replay'
  validate_request(saved,True)
  print(json.dumps({'operationId':saved['command']['operationId'],'reminderRevision':saved['result']['receipt']['reminder']['revision'],'status':'recorded'}),flush=True)
  a=observe('alex-recorded',PRIMARY,'Test Alex','saved',saved);b=observe('sam-recorded',PARTNER,'Test Sam','saved',saved)
  assert a['canonical']==b['canonical']==baseline and a['reminder']==b['reminder']
  if save_passed:
   assert saved_request()==saved
   ended=subprocess.run(['xcrun','simctl','terminate',PRIMARY,'ch.drrius.nest'],capture_output=True,text=True)
   (OUT/'cold-termination.json').write_text(json.dumps({'status':ended.returncode,'diagnostic':ended.stderr},indent=2)+'\n')
   benign=ended.returncode==3 and ('not running' in ended.stderr.lower() or ('found nothing to terminate' in ended.stderr.lower() and 'NSPOSIXErrorDomain, code=3' in ended.stderr))
   assert ended.returncode==0 or benign
   env.update({'NEST_QA_ACTIVE_BILL_REMINDER_ACTION':'recorded_done','NEST_QA_ACTIVE_BILL_POST_BUDGET':'0','NEST_QA_ACTIVE_BILL_REMINDER_OPERATION_ID':saved['command']['operationId'],'NEST_QA_ACTIVE_BILL_REMINDER_REQUEST_JSON':json.dumps(saved)})
   row=run('native-cold-recorded-done',PRIMARY,'NestAccessibilityTests','NativeActiveRecurringReminderSaveTests/testColdRestartKnownBillReminderAndOrdinaryDone',env)
   subprocess.run(['xcrun','xcresulttool','export','attachments','--path',str(OUT/'native-cold-recorded-done/result.xcresult'),'--output-path',str(OUT/'native-cold-recorded-done/attachments')],check=True,capture_output=True)
   done_passed=[row['exitCode'],row['passed'],row['failed'],row['skipped']]==[0,1,0,0]
   assert saved_request() is None or saved_request()==saved
   if done_passed:assert saved_request() is None
  a=observe('alex-final',PRIMARY,'Test Alex','saved',saved);b=observe('sam-final',PARTNER,'Test Sam','saved',saved)
  assert a['canonical']==b['canonical']==baseline and a['reminder']==b['reminder'];after_reads=True
 finally:
  for file in OUT.glob('*/selected.xctestrun'):file.unlink()
  for sim in [PRIMARY,PARTNER]:
   subprocess.run(['xcrun','simctl','ui',sim,'content_size','large'],check=True);subprocess.run(['xcrun','simctl','ui',sim,'appearance','light'],check=True)
   subprocess.run(['xcrun','simctl','launch',sim,'ch.drrius.nest'],check=True,capture_output=True)
  time.sleep(10)
  for key,sim in [('alex',PRIMARY),('sam',PARTNER)]:subprocess.run(['xcrun','simctl','io',sim,'screenshot',str(OUT/(key+'-terminal-screen.png'))],check=True,capture_output=True)
  awake.terminate();awake.wait()
  retained=saved_request();after={'alex':state(PRIMARY,retained is not None),'sam':state(PARTNER)}
  (OUT/'restoration.json').write_text(json.dumps({'before':before,'after':after,'all64JournalsEmpty':retained is None,'originalScopesUnchanged':all(before[k]['actor']==after[k]['actor'] and before[k]['household']==after[k]['household'] for k in before),'largeLight':True,'foregroundLaunchAfterTests':True,'selectedPlansRemoved':True,'scopedCaffeinateStopped':True,'ownedRequestRetained':retained is not None,'TodayReturnedInTest':done_passed},indent=2)+'\n')
  (OUT/'terminal.json').write_text(json.dumps({'nativeSaveMethodPassed':save_passed,'knownDoneMethodPassed':done_passed,'bothFinalCanonicalReadsPassed':after_reads,'SaveInvocationConsumed':(OUT/'save-invocation-consumed.json').exists(),'NoPositiveReplay':True,'RuleChanges':0,'Expenses':0,'WorkersActivated':0},indent=2)+'\n')
 print('Single bill reminder Save phase terminal; no financial command or replay',flush=True)
