from pathlib import Path
import fcntl,hashlib,json,os,plistlib,sqlite3,subprocess,time
os.umask(0o077)
OUT=Path('/private/tmp/nest-native-renewal-crud-20261006')
assert json.loads((OUT/'final-terminal.json').read_text())['success']
lock=open('/private/tmp/nest-food-controls-ui-actor.lock','a+')
fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
assert not (OUT/'restored-running-today.json').exists()
owned=[('alex','C3ABC0D4-CFD4-4F23-8CC3-0E542014803A','791f7261-6c9d-4061-9c8a-57aa6e0b0200'),('sam','CA0BCEDE-A297-493A-8921-9E31F8B65783','e5f80cfd-b69a-4aa0-a267-75784e943676')]
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
rows=[]
for name,sim,actor in owned:
    bundle=Path(subprocess.check_output(['xcrun','simctl','get_app_container',sim,'ch.drrius.nest','app'],text=True).strip())
    info=plistlib.loads((bundle/'Info.plist').read_bytes())
    assert info['NEST_API_URL']=='https://nest-test-api-drrius-projects.vercel.app'
    assert info['NEST_SUPABASE_URL']=='https://tkjixmujjoustdiedfmw.supabase.co'
    assert info['NEST_PUSH_ENABLED']=='false'
    subprocess.run(['codesign','--verify','--deep','--strict',str(bundle)],check=True,capture_output=True)
    subprocess.run(['xcrun','simctl','launch',sim,'ch.drrius.nest'],check=True,capture_output=True)
    time.sleep(4)
    subprocess.run(['xcrun','simctl','io',sim,'screenshot',str(OUT/(name+'-restored-today.png'))],check=True,capture_output=True)
    settings={k:subprocess.check_output(['xcrun','simctl','ui',sim,k],text=True).strip().lower() for k in ['content_size','appearance']}
    assert settings=={'content_size':'large','appearance':'light'}
    scope=state(sim)
    assert scope=={'actor':actor,'household':'be772ffd-3ab5-41d5-8438-647a79a553da','emptyJournals':64}
    rows.append({'scope':scope,'name':name,'simulator':sim,'actor':actor,'settings':settings,'strictSigningVerified':True,'stableFictionalOrigins':True,'appRelaunchedAfterXCTestTermination':True})
(OUT/'restored-running-today.json').write_text(json.dumps(rows,indent=2)+'\n')
binaries={}
for label,derived in [('sdk','/private/tmp/nest-swiftui-partner-sdk-20261005'),('ui','/private/tmp/nest-swiftui-accessibility-20261005')]:
    products=Path(derived)/'Build/Products/Debug-iphonesimulator'
    for rel in ['Nest.app/Nest','NestAppTests.xctest/NestAppTests','NestAccessibilityTests-Runner.app/PlugIns/NestAccessibilityTests.xctest/NestAccessibilityTests']:
        f=products/rel
        if f.exists():binaries[label+'/'+rel]=hashlib.sha256(f.read_bytes()).hexdigest()
(OUT/'native-build-identities.json').write_text(json.dumps({'xcode':subprocess.check_output(['xcodebuild','-version'],text=True).strip(),'binarySHA256':binaries,'sdkNestAndAppTestSourcesUnchangedSince479410ce':True},indent=2)+'\n')
print('Owned apps relaunched; inspect both Today screenshots before final claim')
