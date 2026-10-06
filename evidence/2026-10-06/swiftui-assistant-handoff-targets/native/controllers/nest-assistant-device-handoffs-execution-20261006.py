from pathlib import Path
import sys,importlib.util,fcntl,hashlib,json,os,plistlib,sqlite3,subprocess,time,shutil
os.umask(0o077)
PRIMARY='C3ABC0D4-CFD4-4F23-8CC3-0E542014803A'
PARTNER='CA0BCEDE-A297-493A-8921-9E31F8B65783'
ACTOR='791f7261-6c9d-4061-9c8a-57aa6e0b0200'
PEER='e5f80cfd-b69a-4aa0-a267-75784e943676'
HOUSEHOLD='be772ffd-3ab5-41d5-8438-647a79a553da'
SOURCE='6997138485f3f8088fc03682432de74879e19659'
ORIGINAL=Path('/private/tmp/nest-active-bill-reminder-save-validated-20261006')
SDK=Path('/private/tmp/nest-active-bill-reminder-save-validated-sdk-20261006')
OUT=Path('/private/tmp/nest-assistant-device-handoffs-20261006')
ROOT=Path('/private/tmp/nest-current-qa-82a')
UI=Path('/private/tmp/nest-assistant-device-handoffs-ui-20261006')
PACKAGES=Path('/private/tmp/nest-swiftui-accessibility-20261005/SourcePackages')
UI_SOURCE='dff8d993c224936b869ae16c937989ea3d8677a5'
EXCLUDED={'chore_snapshots','grocery_snapshots','meal_weeks','planned_recipes','cooking_profiles','food_profiles','ingredient_reviews','meal_preparation_snapshots','money_read_snapshots','recipe_read_snapshots','renewal_read_snapshots'}
resolver_path=Path('/private/tmp/nest-selected-test-products-20261006.py')
spec=importlib.util.spec_from_file_location('selected_test_products',resolver_path)
resolver=importlib.util.module_from_spec(spec);spec.loader.exec_module(resolver)


def raw_state(sim,allow_owned=False):
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
        assert set(counts)==set(expected)
        scope=con.execute('SELECT actor,household FROM offline_scope WHERE id=1').fetchone()
        return {'actor':scope[0].lower() if scope else None,'household':scope[1].lower() if scope else None,'emptyJournals':sum(value==0 for value in counts.values()),'ownedReminderRequest':counts['recurring_reminder_requests'],'journalCounts':counts}
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
    needle='AssistantHandoffLinkTests.swift'
    compiled=[line for line in lines if needle in line and ('SwiftCompile' in line or 'swift-frontend' in line)]
    assert compiled, 'Fresh compile must name the owned acceptance source'
    changed=['AssistantHandoffRow.swift','AssistantHistoryScreen.swift','AssistantLegacyRecurringRow.swift','AssistantRenewalRow.swift','AssistantSummaryRow.swift']
    for name in changed:
        shipping=[line for line in lines if name in line and ('SwiftCompile' in line or 'swift-frontend' in line)]
        assert shipping, 'Fresh compile must name changed shipping file: '+name
        compiled+=shipping
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


def state(sim):
 value=raw_state(sim);assert value['emptyJournals']==64 and value['ownedReminderRequest']==0
 return {key:value[key] for key in ['actor','household','emptyJournals','ownedReminderRequest']}

def original_matches(values):
 expected={'alex':ACTOR,'sam':PEER}
 return all(values[key]['actor']==actor and values[key]['household']==HOUSEHOLD and values[key]['emptyJournals']==64 for key,actor in expected.items())

def settled_scopes(key):
 observations=[];last=None;streak=0;start=time.monotonic()
 while time.monotonic()-start<=30:
  try:value={'alex':raw_state(PRIMARY),'sam':raw_state(PARTNER)}
  except AssertionError:value={'readGuardFailed':True}
  if value!=last:
   observations.append({'elapsed':round(time.monotonic()-start,3),'state':value});last=value
  (OUT/(key+'-scope-observations.json')).write_text(json.dumps(observations,indent=2)+'\n')
  if 'readGuardFailed' not in value and original_matches(value):streak+=1
  else:streak=0
  if streak==2:
   proof={'twoContiguousMatchingSamples':True,'elapsed':round(time.monotonic()-start,3),'originalActorsHousehold64':True,'last':value}
   (OUT/(key+'-scope-settled.json')).write_text(json.dumps(proof,indent=2)+'\n')
   return {name:{k:v[k] for k in ['actor','household','emptyJournals','ownedReminderRequest']} for name,v in value.items()}
  time.sleep(1)
 raise AssertionError('Scope did not settle to exact original actors/household/64 within30s; no repair/retry')

def scopes():
 result={'alex':state(PRIMARY),'sam':state(PARTNER)}
 assert result['alex']['actor']==ACTOR and result['sam']['actor']==PEER
 assert result['alex']['household']==result['sam']['household']==HOUSEHOLD
 return result


def verify_ui_inputs():
 frozen=json.loads(Path('/private/tmp/nest-assistant-device-handoffs-20261006-inputs.json').read_text())
 current={str(p.relative_to(ROOT/'apps/ios')):hashlib.sha256(p.read_bytes()).hexdigest() for folder in ['Nest','AppTests','UITests','Tests','Nest.xcodeproj'] for p in (ROOT/'apps/ios'/folder).rglob('*') if p.is_file() and 'xcuserdata' not in p.parts and p.name!='README.md'}
 assert current==frozen and len(current)==1125
 return current



def local_view_state(sim):
 container=Path(subprocess.check_output(['xcrun','simctl','get_app_container',sim,'ch.drrius.nest','data'],text=True).strip())
 databases=list((container/'Library/Application Support').glob('nest-offline-*.sqlite'));assert len(databases)==1
 actor=ACTOR if sim==PRIMARY else PEER
 con=sqlite3.connect('file:'+str(databases[0])+'?mode=ro',uri=True)
 try:
  privacy={table:con.execute('SELECT COUNT(*) FROM '+table+' WHERE lower(actor)=? AND lower(household)=?',(actor,HOUSEHOLD)).fetchone()[0] for table in ['calendar_privacy_removals','calendar_consent_changes']}
  rows=con.execute('SELECT body FROM ingredient_reviews WHERE lower(actor)=? AND lower(household)=? AND week_start=?',(actor,HOUSEHOLD,'2026-10-19')).fetchall();assert len(rows)<=1
  ingredient=json.loads(rows[0][0]) if rows else None
 finally:con.close()
 preferences=container/'Library/Preferences/ch.drrius.nest.plist'
 stored=plistlib.loads(preferences.read_bytes()) if preferences.exists() else {}
 keys={purpose:'nest.calendar.'+purpose+'.'+HOUSEHOLD.upper()+'.'+actor.upper() for purpose in ['display','sharing','layers']}
 selection={purpose:stored.get(key,[]) for purpose,key in keys.items()}
 return {'actor':actor,'household':HOUSEHOLD,'privacyJournalRows':privacy,'ingredientReview':ingredient,'deviceOnlyCalendarSelections':selection}


def original_view_state():
 return {'alex':local_view_state(PRIMARY),'sam':local_view_state(PARTNER)}


def foreground_restore(settings,stage):
 for sim in [PRIMARY,PARTNER]:
  for setting,value in settings[sim].items():subprocess.run(['xcrun','simctl','ui',sim,setting,value],check=True)
  subprocess.run(['xcrun','simctl','launch',sim,'ch.drrius.nest'],check=True,capture_output=True)
 time.sleep(10)
 return settled_scopes(stage)


def handoff_environment(mode,privacy,existing_owner_consent_disabled):
 return {'NEST_QA_MANUAL_WEEK':'20261005','NEST_QA_MANUAL_WEEK_ACTION':'assistant_device_handoffs','NEST_QA_MANUAL_WEEK_NAME':'Test Alex','NEST_QA_ASSISTANT_HANDOFFS':'20261006','NEST_QA_ASSISTANT_HANDOFF_CONVERSATION':'4e809372-f12d-4004-afd3-9a502e98de23','NEST_QA_ASSISTANT_HANDOFF_MODE':mode,'NEST_QA_ASSISTANT_HANDOFF_WEEK':'2026-10-19','NEST_QA_ASSISTANT_HANDOFF_ACTOR':ACTOR,'NEST_QA_ASSISTANT_HANDOFF_HOUSEHOLD':HOUSEHOLD,'NEST_QA_HANDOFF_PRIVACY_REMOVAL_ABSENT':'true' if existing_owner_consent_disabled and all(value==0 for value in privacy.values()) else 'false','NEST_QA_POSITIVE_BUDGET':'0','NEST_QA_API_ORIGIN':'https://nest-test-api-drrius-projects.vercel.app','NEST_QA_SUPABASE_ORIGIN':'https://tkjixmujjoustdiedfmw.supabase.co','NEST_QA_PUSH_ENABLED':'false'}

lock=open('/private/tmp/nest-food-controls-ui-actor.lock','a+')
fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
mode=sys.argv[1] if len(sys.argv)==2 else ''
assert mode in ['--prepare-only','--read-baseline-only','--execute-reviewed']
results=[];complete=False;final_reads=False
if mode=='--prepare-only':
 assert not OUT.exists() and not UI.exists();OUT.mkdir(mode=0o700)
 expected=json.loads(Path('/private/tmp/nest-assistant-device-handoffs-20261006-retained-proof.json').read_text())
 for filename,value in expected.items():
  data=json.loads((ORIGINAL/filename).read_text())
  assert hashlib.sha256(json.dumps(data,sort_keys=True,separators=(',',':')).encode()).hexdigest()==value
  target=OUT/('sdk-source-input-hashes.json' if filename=='source-input-hashes.json' else filename)
  shutil.copy2(ORIGINAL/filename,target)
 before=scopes();settings=ui_settings()
 (OUT/'initial-ui-settings.json').write_text(json.dumps(settings,indent=2)+'\n')
 awake=subprocess.Popen(['caffeinate','-dimsu','-t','1200'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 try:
  subprocess.run(['tar','-xf','/private/tmp/nest-assistant-device-handoffs-20261006-source.tar','-C',str(ROOT)],check=True)
  source=verify_ui_inputs()
  (OUT/'source-input-hashes.json').write_text(json.dumps(source,sort_keys=True)+'\n')
  (OUT/'source-pinning.json').write_text(json.dumps({'UIExecutedSource':UI_SOURCE,'UIInputs':1125,'SDKExecutedSource':SOURCE,'SDKInputs':1122,'FreshUIBuildRequired':True,'MaximumUIInvocations':2,'DomainMutationBudget':0,'LiveModelInvocations':0},indent=2)+'\n')
  print('FreshdffUI compile/all1125, prepare-only NO SDK/API/UI methods',flush=True)
  prepare('NestAccessibility',UI);plan_from(UI,'NestAccessibility');plan_from(SDK,'Nest')
  assert scopes()==before and ui_settings()==settings
  (OUT/'prepared.json').write_text(json.dumps({'Source':UI_SOURCE,'Prepared':True,'Before':before,'NoSDKOrUIExecuted':True},indent=2)+'\n')
 finally:awake.terminate();awake.wait()
 print('Assistant handoff preparation terminal',flush=True)
else:
 prepared=json.loads((OUT/'prepared.json').read_text())
 assert prepared['Prepared'] and prepared['Source']==UI_SOURCE
 verify_ui_inputs();sdk_plan=plan_from(SDK,'Nest');ui_plan=plan_from(UI,'NestAccessibility')
 references=json.loads((OUT/'references.json').read_text());baseline=json.loads((OUT/'baseline.json').read_text());saved=json.loads((OUT/'captured-reminder-request.json').read_text())
 assert saved['command']['operationId'].lower()=='f23e5dfb-cc10-4199-a0f1-bc2cfcbd521c' and saved['result']['status']=='recorded'
 before=scopes();assert before==prepared['Before'];settings=ui_settings()
 awake=subprocess.Popen(['caffeinate','-dimsu','-t','1200'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 if mode=='--read-baseline-only':
  assert not (OUT/'results.json').exists()
  try:
   a=observe('alex-before',PRIMARY,'Test Alex','saved',saved);b=observe('sam-before',PARTNER,'Test Sam','saved',saved)
   assert a['canonical']==b['canonical']==baseline and a['reminder']==b['reminder']
   assert foreground_restore(settings,'baseline-foreground')==before
   view=original_view_state()
   (OUT/'local-view-before.json').write_text(json.dumps(view,indent=2)+'\n')
   (OUT/'baseline-prepared.json').write_text(json.dumps({'BothCanonicalReadsPassed':True,'OriginalScopes64Settled':True,'FixtureNotInsertedByController':True,'NoUIInvoked':True},indent=2)+'\n')
  finally:
   for path in OUT.glob('*/selected.xctestrun'):path.unlink()
   awake.terminate();awake.wait()
  print('Handoff baseline terminal; wait for root fixture insertion and execution signal',flush=True)
 else:
  retained=json.loads((OUT/'baseline-prepared.json').read_text());assert retained['BothCanonicalReadsPassed'] and retained['NoUIInvoked']
  results=json.loads((OUT/'results.json').read_text());assert len(results)==2 and all(r['passed']==1 and r['failed']==0 for r in results)
  fixture=json.loads((OUT/'root-fixture-ready.json').read_text())
  assert fixture['conversationId']=='4e809372-f12d-4004-afd3-9a502e98de23' and fixture['actorId']==ACTOR and fixture['householdId']==HOUSEHOLD
  assert fixture['fixtureInsertedAndVerified'] and not fixture['modelTurnCreated']
  assert settled_scopes('before-ui')==before
  try:
   for key,size,appearance,method in [('normal-light','large','light','testNormalHonestDeviceHandoffsOpenTheirNativeDestinations'),('maximum-dark','accessibility-extra-extra-extra-large','dark','testMaximumHonestDeviceHandoffsOpenTheirNativeDestinations')]:
    view=original_view_state();privacy=view['alex']['privacyJournalRows']
    (OUT/(key+'-local-view-before.json')).write_text(json.dumps(view,indent=2)+'\n')
    subprocess.run(['xcrun','simctl','ui',PRIMARY,'content_size',size],check=True)
    subprocess.run(['xcrun','simctl','ui',PRIMARY,'appearance',appearance],check=True)
    with (OUT/(key+'-ui-invocation-consumed.json')).open('x') as marker:json.dump({'ConsumedBeforeInvocation':True,'MaximumInvocationForProfile':1,'DomainMutationBudget':0,'Source':UI_SOURCE,'time':time.time()},marker)
    row=run(key,PRIMARY,'NestAccessibilityTests','AssistantHandoffLinkTests/'+method,handoff_environment(key.replace('-','_'),privacy,fixture.get('existingOwnerConsentDisabled') is True))
    (OUT/(key+'-local-view-after.json')).write_text(json.dumps(original_view_state(),indent=2)+'\n')
    complete=[row['exitCode'],row['passed'],row['failed'],row['skipped']]==[0,1,0,0]
    if not complete:break
   a=observe('alex-final',PRIMARY,'Test Alex','saved',saved);b=observe('sam-final',PARTNER,'Test Sam','saved',saved)
   assert a['canonical']==b['canonical']==baseline and a['reminder']==b['reminder'];final_reads=True
  finally:
   for path in OUT.glob('*/selected.xctestrun'):path.unlink()
   after=foreground_restore(settings,'final-foreground');assert before==after and ui_settings()==settings
   for name,sim in [('alex',PRIMARY),('sam',PARTNER)]:subprocess.run(['xcrun','simctl','io',sim,'screenshot',str(OUT/(name+'-terminal-screen.png'))],check=True,capture_output=True)
   (OUT/'local-view-final.json').write_text(json.dumps(original_view_state(),indent=2)+'\n')
   awake.terminate();awake.wait()
   (OUT/'restoration.json').write_text(json.dumps({'before':before,'after':after,'all64Empty':True,'originalScopesUnchanged':True,'initialUISettingsRestored':True,'foregroundLaunchAfterTests':True,'ownedPlansRemoved':True,'scopedCaffeinateStopped':True},indent=2)+'\n')
   (OUT/'terminal.json').write_text(json.dumps({'BothUIProfilesPassed':complete and len(results)==6,'BothFinalReadsPassed':final_reads,'UIDomainMutationBudget':0,'LiveModelInvocations':0,'SDKAuthSetupMayPOSTLogin':True,'WirePOSTCountMeasured':False,'NoRepeatedUI':True},indent=2)+'\n')
  print('Assistant native handoffs terminal; no domain mutation/model call',flush=True)
