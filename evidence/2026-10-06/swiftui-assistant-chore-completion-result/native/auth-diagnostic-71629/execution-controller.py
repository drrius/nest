from pathlib import Path
import sys,importlib.util,fcntl,hashlib,json,os,plistlib,sqlite3,subprocess,time,shutil
os.umask(0o077)
PRIMARY='C3ABC0D4-CFD4-4F23-8CC3-0E542014803A'
PARTNER='CA0BCEDE-A297-493A-8921-9E31F8B65783'
ACTOR='791f7261-6c9d-4061-9c8a-57aa6e0b0200'
PEER='e5f80cfd-b69a-4aa0-a267-75784e943676'
HOUSEHOLD='be772ffd-3ab5-41d5-8438-647a79a553da'
SOURCE='587a2349de1ed7c1ddf4d8c619c51dd8db683529'
OUT=Path('/private/tmp/nest-chore-auth-diagnostic-20261006')
ROOT=Path('/private/tmp/nest-current-qa-82a')
SDK=Path('/private/tmp/nest-chore-auth-diagnostic-sdk-20261006')
PACKAGES=Path('/private/tmp/nest-swiftui-accessibility-20261005/SourcePackages')
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

def ui_settings():
 values={}
 for sim in [PRIMARY,PARTNER]:
  values[sim]={key:subprocess.check_output(['xcrun','simctl','ui',sim,key],text=True).strip() for key in ['appearance','content_size']}
  assert values[sim]=={'appearance':'light','content_size':'large'},'Require and preserve measured initial large/light'
 return values

def state(sim):
 value=raw_state(sim);assert value['emptyJournals']==64 and value['ownedReminderRequest']==0
 return {key:value[key] for key in ['actor','household','emptyJournals','ownedReminderRequest']}

def scopes():
 result={'alex':state(PRIMARY),'sam':state(PARTNER)}
 assert result['alex']['actor']==ACTOR and result['sam']['actor']==PEER
 assert result['alex']['household']==result['sam']['household']==HOUSEHOLD
 return result

def verify_ui_inputs():
 frozen=json.loads(Path('/private/tmp/nest-chore-auth-diagnostic-20261006-inputs.json').read_text())
 current={str(p.relative_to(ROOT/'apps/ios')):hashlib.sha256(p.read_bytes()).hexdigest() for folder in ['Nest','AppTests','UITests','Tests','Nest.xcodeproj'] for p in (ROOT/'apps/ios'/folder).rglob('*') if p.is_file() and 'xcuserdata' not in p.parts and p.name!='README.md'}
 assert current==frozen and len(current)==1129
 return current

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

def diagnostic():
 global row,trace,attempted
 case=OUT/'diagnostic-alex';case.mkdir()
 plan=plistlib.loads(plistlib.dumps(sdk_plan))
 env={'NEST_QA_CHORE_HISTORY_AUTH_DIAGNOSTIC':'20261006-one-owner-boundary','NEST_QA_NAME':'Test Alex','NEST_QA_ACTOR':ACTOR,'NEST_QA_HOUSEHOLD':HOUSEHOLD,'NEST_QA_POSITIVE_BUDGET':'0','NEST_QA_API_ORIGIN':'https://nest-test-api-drrius-projects.vercel.app','NEST_QA_SUPABASE_ORIGIN':'https://tkjixmujjoustdiedfmw.supabase.co','NEST_QA_PUSH_ENABLED':'false'}
 plan['NestAppTests'].setdefault('EnvironmentVariables',{}).update(env)
 selected=case/'selected.xctestrun';selected.write_bytes(plistlib.dumps(plan));selected.chmod(0o600)
 method='HostedChoreHistoryAuthDiagnosticTests/testExistingOwnerSessionAndTracedMembershipReadOnly'
 args=['xcodebuild','-xctestrun',str(selected),'-destination','platform=iOS Simulator,id='+PRIMARY,'-parallel-testing-enabled','NO','-resultBundlePath',str(case/'result.xcresult'),'-only-testing:NestAppTests/'+method,'test-without-building']
 with (case/'test.log').open('w') as log:
  attempted=True
  result=subprocess.run(args,stdout=log,stderr=subprocess.STDOUT)
 summary=json.loads(subprocess.check_output(['xcrun','xcresulttool','get','test-results','summary','--path',str(case/'result.xcresult')],text=True))
 row={'method':method,'source':SOURCE,'exitCode':result.returncode,'passed':summary['passedTests'],'failed':summary['failedTests'],'skipped':summary['skippedTests'],'seconds':round(summary['finishTime']-summary['startTime'],3)}
 (OUT/'diagnostic-results.json').write_text(json.dumps(row,indent=2)+'\n');print(json.dumps(row),flush=True)
 attachments=case/'attachments'
 subprocess.run(['xcrun','xcresulttool','export','attachments','--path',str(case/'result.xcresult'),'--output-path',str(attachments)],check=True,capture_output=True)
 traces=[]
 for path in attachments.glob('*.json'):
  value=json.loads(path.read_text())
  if isinstance(value,dict) and {'diagnosticFinished','nativeMembershipVerified','requests','domainMutationBudget'}.issubset(value):traces.append(value)
 assert len(traces)==1,'Preserve missing/unexpected diagnostic output; no repeat'
 trace=traces[0]
 assert trace['domainMutationBudget']==0 and not trace['old9410CauseEstablishedByThisDiagnostic']
 assert not trace['tokenHeadersProviderBodiesOrCredentialsExported']
 requests=trace['requests'];assert len(requests)<=2
 assert all(r['method']=='GET' and r['path'] in ['/v1/session','/auth/v1/user'] for r in requests)
 assert sum(r['path']=='/v1/session' for r in requests)<=1
 assert sum(r['path']=='/auth/v1/user' for r in requests)<=1
 if any(r['path']=='/auth/v1/user' for r in requests):assert requests[0]['path']=='/v1/session' and requests[0]['status']==401
 (OUT/'diagnostic-observation.json').write_text(json.dumps(trace,indent=2)+'\n')
 print(json.dumps({'safeObservation':trace}),flush=True)
 return row,trace

lock=open('/private/tmp/nest-food-controls-ui-actor.lock','a+')
fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
assert len(sys.argv)==2 and sys.argv[1]=='--diagnostic-reviewed'
prepared=json.loads((OUT/'prepared.json').read_text())
assert prepared['Prepared'] and prepared['Source']==SOURCE and prepared['NoSDKOrUIExecuted']
assert not (OUT/'diagnostic-invocation-consumed.json').exists() and not (OUT/'diagnostic-alex').exists()
verify_ui_inputs();sdk_plan=plan_from(SDK,'Nest')
before=scopes();assert before==prepared['Before'];settings=ui_settings();view_before=original_view_state()
(OUT/'diagnostic-local-view-before.json').write_text(json.dumps(view_before,indent=2)+'\n')
row=None;trace=None;attempted=False;restored=False
awake=subprocess.Popen(['caffeinate','-dimsu','-t','1200'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
 with (OUT/'diagnostic-invocation-consumed.json').open('x') as marker:
  json.dump({'ConsumedBeforeInvocation':True,'Source':SOURCE,'DiagnosticBudgetConsumed':True,'UIInvocationBudget':0,'DomainMutationBudget':0,'time':time.time()},marker)
 row,trace=diagnostic()
finally:
 try:
  after=foreground_restore(settings,'diagnostic-final-foreground');assert after==before
  view_after=original_view_state();assert view_after==view_before and ui_settings()==settings
  (OUT/'diagnostic-local-view-after.json').write_text(json.dumps(view_after,indent=2)+'\n')
  for sim,name in [(PRIMARY,'alex'),(PARTNER,'sam')]:
   subprocess.run(['xcrun','simctl','io',sim,'screenshot',str(OUT/(name+'-diagnostic-terminal-screen.png'))],check=True,capture_output=True)
  (OUT/'diagnostic-restoration.json').write_text(json.dumps({'before':before,'after':after,'all64Empty':True,'originalScopesUnchanged':True,'initialUISettingsRestored':True,'ordinaryForegroundLaunchAfterDiagnostic':True,'foregroundTodayVerifiedByThisController':False,'localViewSemanticsUnchanged':True},indent=2)+'\n')
  restored=True
 finally:
  for path in OUT.glob('*/selected.xctestrun'):path.unlink()
  awake.terminate();awake.wait()
  (OUT/'diagnostic-terminal.json').write_text(json.dumps({'Source':SOURCE,'NativeInputs':1129,'DiagnosticInvocationAttempts':int(attempted),'DiagnosticBudgetConsumed':(OUT/'diagnostic-invocation-consumed.json').exists(),'SummaryRecorded':row is not None,'ObservationRecorded':trace is not None,'DiagnosticMethodPassed':row is not None and [row['exitCode'],row['passed'],row['failed'],row['skipped']]==[0,1,0,0],'NativeMembershipVerified':trace is not None and trace['nativeMembershipVerified'],'RestorationStateChecksPassed':restored,'UIInvoked':False,'Old9410CauseProven':False,'DomainMutationBudget':0,'ManualCredentialChanges':False,'AuthSessionMayNaturallyRefresh':True,'WirePOSTCountMeasured':False},indent=2)+'\n')
print('One guarded auth boundary diagnostic terminal; no UI/domain action or retry',flush=True)
