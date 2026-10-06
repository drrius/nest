from pathlib import Path
import fcntl,hashlib,json,os,plistlib,sqlite3,subprocess,sys,time
os.umask(0o077)
PRIMARY='C3ABC0D4-CFD4-4F23-8CC3-0E542014803A'
PARTNER='CA0BCEDE-A297-493A-8921-9E31F8B65783'
ACTOR='791f7261-6c9d-4061-9c8a-57aa6e0b0200'
PEER='e5f80cfd-b69a-4aa0-a267-75784e943676'
HOUSEHOLD='be772ffd-3ab5-41d5-8438-647a79a553da'
SOURCE='ffc76186f43f89f7c31ef4cbffe749854a9479c9'
ROOT=Path('/private/tmp/nest-current-qa-82a')
OUT=Path('/private/tmp/nest-quiet-card-eager-20261006')
UI=Path('/private/tmp/nest-quiet-card-eager-ui-20261006')
PACKAGES=Path('/private/tmp/nest-swiftui-accessibility-20261005/SourcePackages')
EXCLUDED={'chore_snapshots','grocery_snapshots','meal_weeks','planned_recipes','cooking_profiles','food_profiles','ingredient_reviews','meal_preparation_snapshots','money_read_snapshots','recipe_read_snapshots','renewal_read_snapshots'}

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

def selected_products(plan, suite, products):
    root = Path(products).resolve(strict=True)
    target = plan[suite]
    host = target["TestHostPath"].replace("__TESTROOT__", str(root))
    resolved = {}
    for field in ("TestHostPath", "TestBundlePath", "UITargetAppPath"):
        if field not in target:
            continue
        value = target[field].replace("__TESTROOT__", str(root)).replace("__TESTHOST__", host)
        if "__" in value:
            raise ValueError("Unresolved selected product placeholder")
        path = Path(value).resolve(strict=True)
        if not path.is_relative_to(root):
            raise ValueError("Selected test product escapes its build directory")
        resolved[field] = str(path)
    if "TestBundlePath" not in resolved:
        raise ValueError("Selected suite has no test bundle")
    return resolved

def frozen_inputs():
    expected=json.loads(Path('/private/tmp/nest-quiet-card-eager-inputs-20261006.json').read_text())
    actual={str(p.relative_to(ROOT/'apps/ios')):hashlib.sha256(p.read_bytes()).hexdigest() for folder in ['Nest','AppTests','UITests','Tests','Nest.xcodeproj'] for p in (ROOT/'apps/ios'/folder).rglob('*') if p.is_file() and 'xcuserdata' not in p.parts and p.name!='README.md'}
    assert actual==expected and len(actual)==1129
    return actual

def products():
    paths=list((UI/'Build/Products').glob('NestAccessibility_*.xctestrun'));assert len(paths)==1
    plan=absolute(plistlib.loads(paths[0].read_bytes()),paths[0].parent)
    info=plistlib.loads((UI/'Build/Products/Debug-iphonesimulator/Nest.app/Info.plist').read_bytes())
    assert info['NEST_API_URL']=='https://nest-test-api-drrius-projects.vercel.app'
    assert info['NEST_SUPABASE_URL']=='https://tkjixmujjoustdiedfmw.supabase.co'
    assert info['NEST_PUSH_ENABLED']=='false' and info['CFBundleVersion']=='19'
    subprocess.run(['codesign','--verify','--deep','--strict',str(UI/'Build/Products/Debug-iphonesimulator/Nest.app')],check=True,capture_output=True)
    binaries={str(p.relative_to(UI)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (UI/'Build/Products/Debug-iphonesimulator').rglob('*') if p.is_file() and p.name in ['Nest','Nest.debug.dylib','NestAccessibilityTests']}
    assert len(binaries)==3
    return plan,{'source':SOURCE,'inputs':1129,'binarySHA256':binaries,'selectedProducts':selected_products(plan,'NestAccessibilityTests',paths[0].parent),'originsVerified':True,'pushEnabled':False,'version':'19'}

def prepare():
    assert not OUT.exists() and not UI.exists();OUT.mkdir(mode=0o700)
    before=scopes();settings=ui_settings();local=original_view_state()
    subprocess.run(['tar','-xf','/private/tmp/nest-quiet-card-eager-source-20261006.tar','-C',str(ROOT)],check=True)
    frozen_inputs()
    command=['xcodebuild','-project',str(ROOT/'apps/ios/Nest.xcodeproj'),'-scheme','NestAccessibility','-configuration','Debug','-destination','platform=iOS Simulator,id='+PRIMARY,'-derivedDataPath',str(UI),'-clonedSourcePackagesDirPath',str(PACKAGES),'-xcconfig','/private/tmp/nest-swiftui-test.xcconfig','-parallel-testing-enabled','NO','CODE_SIGNING_ALLOWED=YES','CODE_SIGN_IDENTITY=-','build-for-testing']
    with (OUT/'prepare.log').open('w') as log:result=subprocess.run(command,stdout=log,stderr=subprocess.STDOUT)
    assert result.returncode==0,'Fresh build failed; inspect protected log, no UI invoked'
    lines=(OUT/'prepare.log').read_text().splitlines()
    compiled=[l for l in lines if ('SwiftCompile' in l or 'swift-frontend' in l) and ('QuietSectionCard.swift' in l or 'RootAccessibilityTests.swift' in l)]
    assert any('QuietSectionCard.swift' in l for l in compiled) and any('RootAccessibilityTests.swift' in l for l in compiled)
    _,attestation=products();attestation['compileLines']=compiled
    (OUT/'products.json').write_text(json.dumps(attestation,indent=2)+'\n')
    assert scopes()==before and ui_settings()==settings and original_view_state()==local
    (OUT/'prepared.json').write_text(json.dumps({'source':SOURCE,'prepared':True,'before':before,'settings':settings,'local':local,'nativeAuditInvoked':False},indent=2)+'\n')
    (OUT/'source-inputs.json').write_text(json.dumps(frozen_inputs(),sort_keys=True)+'\n')
    print('Fresh Quiet card build/signing/source preparation PASS; no UI audit invoked',flush=True)

def restore(settings):
    for sim in [PRIMARY,PARTNER]:
        for key,value in settings[sim].items():subprocess.run(['xcrun','simctl','ui',sim,key,value],check=True)
        stopped=subprocess.run(['xcrun','simctl','terminate',sim,'ch.drrius.nest'],capture_output=True,text=True)
        assert stopped.returncode==0 or 'not running' in stopped.stderr.lower(), 'Unexpected terminate refusal'
        subprocess.run(['xcrun','simctl','launch',sim,'ch.drrius.nest'],check=True,capture_output=True)
    time.sleep(10)
    return settled_scopes('final')

def audit():
    prep=json.loads((OUT/'prepared.json').read_text());assert prep['source']==SOURCE and prep['prepared']
    assert not (OUT/'audit-consumed.json').exists()
    frozen_inputs();plan,attestation=products();assert attestation=={k:v for k,v in json.loads((OUT/'products.json').read_text()).items() if k!='compileLines'}
    assert scopes()==prep['before'] and ui_settings()==prep['settings']
    selected=OUT/'selected.xctestrun';selected.write_bytes(plistlib.dumps(plan));selected.chmod(0o600)
    attempted=False;summary=None;restored=False
    awake=subprocess.Popen(['caffeinate','-dimsu','-t','1200'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        with (OUT/'audit-consumed.json').open('x') as f:json.dump({'source':SOURCE,'oneSuiteInvocation':True,'methodsExpected':5,'domainBudget':0},f)
        command=['xcodebuild','-xctestrun',str(selected),'-destination','platform=iOS Simulator,id='+PRIMARY,'-parallel-testing-enabled','NO','-resultBundlePath',str(OUT/'audit.xcresult'),'-only-testing:NestAccessibilityTests/RootAccessibilityTests','test-without-building']
        with (OUT/'audit.log').open('w') as log:
            attempted=True;result=subprocess.run(command,stdout=log,stderr=subprocess.STDOUT)
        summary=json.loads(subprocess.check_output(['xcrun','xcresulttool','get','test-results','summary','--path',str(OUT/'audit.xcresult')],text=True))
        (OUT/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
        print(json.dumps({'auditExitCode':result.returncode,'passed':summary['passedTests'],'failed':summary['failedTests'],'skipped':summary['skippedTests']}),flush=True)
    finally:
        try:
            after=restore(prep['settings']);assert after==prep['before']
            assert ui_settings()==prep['settings'] and original_view_state()==prep['local']
            for sim,name in [(PRIMARY,'alex'),(PARTNER,'sam')]:subprocess.run(['xcrun','simctl','io',sim,'screenshot',str(OUT/(name+'-final.png'))],check=True,capture_output=True)
            restored=True
        finally:
            if selected.exists():selected.unlink()
            awake.terminate();awake.wait()
            (OUT/'terminal.json').write_text(json.dumps({'source':SOURCE,'suiteInvocationAttempted':attempted,'summaryRecorded':summary is not None,'restorationPassed':restored,'domainCommands':0,'liveModelInvoked':False,'findingsSuppressed':0,'wireAuthRequestsMeasured':False},indent=2)+'\n')
    print('Root audit terminal; audit approval must be judged from actual findings',flush=True)

lock=open('/private/tmp/nest-food-controls-ui-actor.lock','a+')
fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
assert len(sys.argv)==2
if sys.argv[1]=='--prepare-only':prepare()
elif sys.argv[1]=='--audit-reviewed':audit()
else:raise AssertionError('Unapproved mode')
