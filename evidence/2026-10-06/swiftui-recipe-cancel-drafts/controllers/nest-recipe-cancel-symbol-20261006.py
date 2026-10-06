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

OUT=Path('/private/tmp/nest-recipe-cancel-symbol-20261006');assert not OUT.exists();OUT.mkdir(mode=0o700)
lock=open('/private/tmp/nest-food-controls-ui-actor.lock','a+');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
EXCLUDED.add('renewal_read_snapshots')
before={'alex':state(PRIMARY),'sam':state(PARTNER)}
assert before['alex']=={'actor':ACTOR,'household':HOUSEHOLD,'emptyJournals':64}
assert before['sam']=={'actor':PEER,'household':HOUSEHOLD,'emptyJournals':64}
results=[];completed=False;ui_completed=0
awake=subprocess.Popen(['caffeinate','-dimsu','-t','1200'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
def export(key):
    case=OUT/key
    subprocess.run(['xcrun','xcresulttool','export','attachments','--path',str(case/'result.xcresult'),'--output-path',str(case/'attachments')],check=True,capture_output=True)
def observe(key,sim,name):
    env={'NEST_QA_RECIPE_CANCEL_READ':'20261006','NEST_QA_RECIPE_CANCEL_NAME':name,'NEST_QA_RECIPE_CANCEL_ENTRY_ID':entry}
    if baseline is not None:env['NEST_QA_RECIPE_CANCEL_BASELINE_JSON']=json.dumps(baseline)
    row=run(key,sim,'NestAppTests','HostedRecipeCancelDraftReadTests/testGETOnlyCurrentOwnedRecipeLibraryAndCapturedWeek',env);export(key)
    values=[]
    for file in (OUT/key/'attachments').glob('*.json'):
        value=json.loads(file.read_text())
        if isinstance(value,dict) and {'actor','household','library','recipe','week','planned'}.issubset(value):values.append(value)
    if values:
        assert len(values)==1
        (OUT/key/'native-read.json').write_text(json.dumps(values[0],indent=2)+'\n')
    assert row['passed']==1 and row['failed']==row['skipped']==0 and row['exitCode']==0
    return values[0]

try:
    subprocess.run(['tar','-xf','/private/tmp/nest-recipe-cancel-symbol-native-source.tar','-C',str(ROOT)],check=True)
    frozen=json.loads(Path('/private/tmp/nest-recipe-cancel-symbol-frozen-inputs.json').read_text())
    source={str(p.relative_to(ROOT/'apps/ios')):hashlib.sha256(p.read_bytes()).hexdigest() for folder in ['Nest','AppTests','UITests','Tests','Nest.xcodeproj'] for p in (ROOT/'apps/ios'/folder).rglob('*') if p.is_file() and 'xcuserdata' not in p.parts and p.name!='README.md'};assert frozen==source
    (OUT/'source-input-hashes.json').write_text(json.dumps(source,sort_keys=True)+'\n')
    print('FROZEN a432/build19/all1104inputs; compact Done focused MAX only',flush=True)
    (OUT/'source-pinning.json').write_text(json.dumps({'ExecutedSourceCommit':'a432974d66e79b778fb83f82a0f54c17dca1d438','AllNativeInputs':1104,'SDKAndUIRebuilt':True,'ParentQualityRefactorsIncluded':True},indent=2)+'\n')
    entry='f040105f-89b5-4370-aa2f-636c7c284be1'
    baseline=None
    sdk_plan=prepare('Nest',SDK)
    baseline=observe('alex-before',PRIMARY,'Test Alex')
    partner=observe('sam-before',PARTNER,'Test Sam')
    assert baseline['library']==partner['library'] and baseline['recipe']==partner['recipe']
    assert baseline['week']==partner['week'] and baseline['planned']==partner['planned']
    ui_plan=prepare('NestAccessibility',UI)
    for profile,size,appearance in [('maximum_dark','accessibility-extra-extra-extra-large','dark')]:
        subprocess.run(['xcrun','simctl','ui',PRIMARY,'content_size',size],check=True)
        subprocess.run(['xcrun','simctl','ui',PRIMARY,'appearance',appearance],check=True)
        env={'NEST_QA_RECIPE_CANCEL_UI':'20261006','NEST_QA_RECIPE_CANCEL_PHASE':'after','NEST_QA_RECIPE_CANCEL_NAME':'Test Alex','NEST_QA_RECIPE_CANCEL_DEFINITION_ID':'1f5b84c0-8ecb-4f5d-ad33-0a60088b239b','NEST_QA_RECIPE_CANCEL_PROFILE':profile,'NEST_QA_RECIPE_CANCEL_RECIPE_JSON':json.dumps(baseline['recipe']),'NEST_QA_MANUAL_WEEK':'20261005','NEST_QA_MANUAL_WEEK_ACTION':'read_recipe_cancel_drafts','NEST_QA_MANUAL_WEEK_NAME':'Test Alex','NEST_QA_API_ORIGIN':'https://nest-test-api-drrius-projects.vercel.app','NEST_QA_SUPABASE_ORIGIN':'https://tkjixmujjoustdiedfmw.supabase.co','NEST_QA_PUSH_ENABLED':'false'}
        row=run(profile,PRIMARY,'NestAccessibilityTests','NativeRecipeCancelDraftTests/testMaximumCompactDonePreservesUnsentInvalidRecipeInput',env);export(profile)
        if row['passed']!=1 or row['failed']!=0 or row['skipped']!=0 or row['exitCode']!=0:break
        ui_completed+=1
    a=observe('alex-after',PRIMARY,'Test Alex');b=observe('sam-after',PARTNER,'Test Sam')
    for key in ['library','recipe','week','planned']:assert a[key]==b[key]==baseline[key]
    completed=ui_completed==1

finally:
    for key in ['normal_light','maximum_dark','alex-before','sam-before','alex-after','sam-after']:(OUT/key/'selected.xctestrun').unlink(missing_ok=True)
    for key,sim in [('alex',PRIMARY),('sam',PARTNER)]:
        subprocess.run(['xcrun','simctl','ui',sim,'content_size','large'],check=True)
        subprocess.run(['xcrun','simctl','ui',sim,'appearance','light'],check=True)
        subprocess.run(['xcrun','simctl','launch',sim,'ch.drrius.nest'],check=True,capture_output=True)
        time.sleep(4)
        subprocess.run(['xcrun','simctl','io',sim,'screenshot',str(OUT/(key+'-restored-today.png'))],check=True,capture_output=True)
    awake.terminate();awake.wait()
    after={'alex':state(PRIMARY),'sam':state(PARTNER)};assert before==after
    (OUT/'restoration.json').write_text(json.dumps({'before':before,'after':after,'appearance':'light','contentSize':'large','hostedMutations':0},indent=2)+'\n')
    (OUT/'terminal.json').write_text(json.dumps({'compactDoneMaximumPassed':completed,'UIProfilesPassed':ui_completed,'buildNumber':'19','hostedMutations':0,'stopAfterFailure':not completed},indent=2)+'\n')
print('Native recipe corrected Cancel terminal',flush=True)
