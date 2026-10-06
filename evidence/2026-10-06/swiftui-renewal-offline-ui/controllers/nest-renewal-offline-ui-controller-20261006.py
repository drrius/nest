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
    args=['xcodebuild','-project',str(ROOT/'apps/ios/Nest.xcodeproj'),'-scheme',scheme,'-configuration','Debug','-destination','platform=iOS Simulator,id='+PRIMARY,'-derivedDataPath',str(derived),'-clonedSourcePackagesDirPath',str(UI/'SourcePackages'),'-xcconfig',str(OUT/'relay.xcconfig'),'-parallel-testing-enabled','NO','CODE_SIGNING_ALLOWED=YES','CODE_SIGN_IDENTITY=-','build-for-testing']
    with (OUT/(scheme+'-prepare.log')).open('w') as log:
        result=subprocess.run(args,stdout=log,stderr=subprocess.STDOUT)
    assert result.returncode==0, 'Inspect protected prepare log'
    app=derived/'Build/Products/Debug-iphonesimulator/Nest.app'
    info=plistlib.loads((app/'Info.plist').read_bytes())
    assert info['NEST_API_URL']=='https://localhost:4662'
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

OUT=Path('/private/tmp/nest-renewal-offline-ui-20261006');assert not OUT.exists();OUT.mkdir(mode=0o700)
DERIVED=Path('/private/tmp/nest-swiftui-renewal-offline-ui-20261006')
lock=open('/private/tmp/nest-food-controls-ui-actor.lock','a+');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
EXCLUDED.add('renewal_read_snapshots')
assert state(PRIMARY)=={'actor':ACTOR,'household':HOUSEHOLD,'emptyJournals':64}
assert state(PARTNER)=={'actor':PEER,'household':HOUSEHOLD,'emptyJournals':64}
results=[];success=False;relay=None
stable=UI/'Build/Products/Debug-iphonesimulator/Nest.app'
info=plistlib.loads((stable/'Info.plist').read_bytes())
assert info['NEST_API_URL']=='https://nest-test-api-drrius-projects.vercel.app'
assert info['NEST_SUPABASE_URL']=='https://tkjixmujjoustdiedfmw.supabase.co' and info['NEST_PUSH_ENABLED']=='false'
subprocess.run(['codesign','--verify','--deep','--strict',str(stable)],check=True,capture_output=True)
awake=subprocess.Popen(['caffeinate','-dimsu','-t','1200'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
    config="""[req]
prompt=no
distinguished_name=subject
x509_extensions=extensions
[subject]
CN=localhost
O=Nest isolated native QA
[extensions]
subjectAltName=DNS:localhost
basicConstraints=critical,CA:TRUE
keyUsage=critical,keyCertSign,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
nameConstraints=critical,permitted;DNS:localhost
"""
    (OUT/'localhost.conf').write_text(config)
    with (OUT/'certificate.log').open('w') as log:
        subprocess.run(['openssl','req','-x509','-nodes','-newkey','rsa:2048','-days','2','-keyout',str(OUT/'localhost.key'),'-out',str(OUT/'localhost.crt'),'-config',str(OUT/'localhost.conf')],check=True,stdout=log,stderr=subprocess.STDOUT)
    for sim in [PRIMARY,PARTNER]:
        subprocess.run(['xcrun','simctl','keychain',sim,'add-root-cert',str(OUT/'localhost.crt')],check=True,capture_output=True)
        subprocess.run(['xcrun','simctl','ui',sim,'content_size','large'],check=True)
        subprocess.run(['xcrun','simctl','ui',sim,'appearance','light'],check=True)
    (OUT/'relay.xcconfig').write_text('#include "/private/tmp/nest-swiftui-test.xcconfig"\nNEST_API_URL = https:/$()/localhost:4662\n')
    relay_log=(OUT/'relay.log').open('w')
    relay=subprocess.Popen(['python3','-u','/private/tmp/nest-renewal-offline-ui-relay-20261006.py'],stdout=relay_log,stderr=subprocess.STDOUT)
    time.sleep(1);assert relay.poll() is None
    ui_plan=prepare('NestAccessibility',DERIVED)
    source={str(p.relative_to(ROOT/'apps/ios')):hashlib.sha256(p.read_bytes()).hexdigest() for folder in ['Nest','AppTests','UITests','Tests','Nest.xcodeproj'] for p in (ROOT/'apps/ios'/folder).rglob('*') if p.is_file() and 'xcuserdata' not in p.parts and p.name!='README.md'}
    (OUT/'source-inputs-private.json').write_text(json.dumps(source,sort_keys=True)+'\n')
    for key,sim,name in [('alex',PRIMARY,'Test Alex'),('sam',PARTNER,'Test Sam')]:
        env={'NEST_QA_RENEWAL_OFFLINE_UI':'20261006','NEST_QA_RENEWAL_NAME':name,'NEST_QA_API_ORIGIN':'https://localhost:4662','NEST_QA_SUPABASE_ORIGIN':'https://tkjixmujjoustdiedfmw.supabase.co','NEST_QA_PUSH_ENABLED':'false'}
        row=run(key,sim,'NestAccessibilityTests','NativeRenewalOfflineViewTests/testRealCachedEmptyListSurvivesUnavailableReadAndColdRestart',env)
        subprocess.run(['xcrun','xcresulttool','export','attachments','--path',str(OUT/key/'result.xcresult'),'--output-path',str(OUT/key/'attachments')],check=True,capture_output=True)
        assert row['passed']==1 and row['failed']==row['skipped']==0 and row['exitCode']==0
        events=json.loads((OUT/'relay-events.json').read_text());actor=ACTOR if key=='alex' else PEER
        reads=[e for e in events if e.get('actor')==actor and e.get('read')=='/v1/renewals']
        assert len([e for e in reads if e['status']==200 and e['forwarded']])==1
        assert len([e for e in reads if e['status']==503 and not e['forwarded']])>=2
    assert not any(e.get('method') for e in events), 'Inspect rejected requests before claiming clean read-only journey'
    success=True
finally:
    if relay is not None:relay.terminate();relay.wait(timeout=30);relay_log.close()
    for sim in [PRIMARY,PARTNER]:
        subprocess.run(['xcrun','simctl','terminate',sim,'ch.drrius.nest'],capture_output=True)
        subprocess.run(['xcrun','simctl','install',sim,str(stable)],check=True,capture_output=True)
        subprocess.run(['xcrun','simctl','launch',sim,'ch.drrius.nest'],check=True,capture_output=True)
        time.sleep(4)
        subprocess.run(['xcrun','simctl','io',sim,'screenshot',str(OUT/(sim+'-restored-today.png'))],check=True,capture_output=True)
    (OUT/'localhost.key').unlink(missing_ok=True);(OUT/'relay.xcconfig').unlink(missing_ok=True)
    for key in ['alex','sam']:(OUT/key/'selected.xctestrun').unlink(missing_ok=True)
    awake.terminate();awake.wait()
    (OUT/'restoration.json').write_text(json.dumps({'alex':state(PRIMARY),'sam':state(PARTNER),'apiOrigin':info['NEST_API_URL'],'pushEnabled':info['NEST_PUSH_ENABLED'],'appearance':'light','contentSize':'large','keychainsReset':False,'macTrustModified':False,'publicRootsExpireAfterDays':2},indent=2)+'\n')
    (OUT/'terminal.json').write_text(json.dumps({'success':success,'readOnly':True,'relayStopped':relay is None or relay.poll() is not None,'generatedKeyRemoved':not (OUT/'localhost.key').exists(),'overrideRemoved':not (OUT/'relay.xcconfig').exists(),'inspectBeforeResuming':not success},indent=2)+'\n')
print('Native cold-restart renewal cache UI terminal',flush=True)
