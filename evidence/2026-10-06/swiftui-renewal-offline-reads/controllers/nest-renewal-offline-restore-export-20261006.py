from pathlib import Path
import fcntl,hashlib,json,os,plistlib,re,shutil,sqlite3,subprocess,time
os.umask(0o077)
ROOT=Path('/private/tmp/nest-current-qa-82a')
OUT=Path('/private/tmp/nest-renewal-offline-public-evidence-20261006');assert not OUT.exists();OUT.mkdir(mode=0o700)
lock=open('/private/tmp/nest-food-controls-ui-actor.lock','a+');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
EXCLUDED={'chore_snapshots','grocery_snapshots','meal_weeks','planned_recipes','cooking_profiles','food_profiles','ingredient_reviews','meal_preparation_snapshots','money_read_snapshots','recipe_read_snapshots','renewal_read_snapshots'}
def state(sim):
    c=Path(subprocess.check_output(['xcrun','simctl','get_app_container',sim,'ch.drrius.nest','data'],text=True).strip())
    files=list((c/'Library/Application Support').glob('nest-offline-*.sqlite'));assert len(files)==1
    db=sqlite3.connect('file:'+str(files[0])+'?mode=ro',uri=True)
    try:
        scope=db.execute('SELECT actor,household FROM offline_scope WHERE id=1').fetchone()
        counts={}
        for (table,) in db.execute("SELECT name FROM sqlite_master WHERE type='table'"):
            assert table.replace('_','').isalnum()
            cols={r[1] for r in db.execute('PRAGMA table_info("'+table+'")')}
            if {'body','actor','household'}.issubset(cols) and table not in EXCLUDED:
                counts[table]=db.execute('SELECT COUNT(*) FROM "'+table+'" WHERE body IS NOT NULL AND body != ?',('null',)).fetchone()[0]
        assert len(counts)==64 and not any(counts.values())
        return {'actor':scope[0].lower(),'household':scope[1].lower(),'emptyIntentJournals':64}
    finally:db.close()
def textlog(src,dst):
    text=src.read_text();assert not re.search(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.',text)
    assert not re.search(r'Bearer\s+[A-Za-z0-9_.-]+',text,re.I)
    dst.write_text('\n'.join(l.rstrip() for l in text.splitlines())+'\n')
def export_case(case,dst):
    dst.mkdir()
    result=case/'result.xcresult'
    summary=json.loads(subprocess.check_output(['xcrun','xcresulttool','get','test-results','summary','--path',str(result)],text=True))
    (dst/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
    log=case/'test.log' if (case/'test.log').exists() else case/'native-test.log'
    textlog(log,dst/'native-test.txt')
    if (case/'native-read.json').exists():shutil.copy2(case/'native-read.json',dst/'native-read.json')
    if (case/'attachments').exists():
        for f in (case/'attachments').iterdir():
            if f.suffix in ['.png','.txt','.json']:shutil.copy2(f,dst/f.name)
repro=Path('/private/tmp/nest-renewal-offline-repro-after-fixture-fix-20261006');export_case(repro,OUT/'reproduction')
focused=Path('/private/tmp/nest-renewal-offline-focused-with-races-20261006');export_case(focused,OUT/'focused-app')
textlog(focused/'foundation-tests.log',OUT/'foundation-tests.txt')
for name,source in [('integration','/private/tmp/nest-renewal-offline-real-read-20261006'),('online-ui','/private/tmp/nest-renewal-offline-online-ui-20261006')]:
    src=Path(source);dst=OUT/name;dst.mkdir()
    assert json.loads((src/'terminal.json').read_text())['success']
    for filename in ['results.json','restoration.json','terminal.json']:shutil.copy2(src/filename,dst/filename)
    for actor in ['alex','sam']:export_case(src/actor,dst/actor)
    shutil.copy2(src/'source-inputs-private.json',dst/'source-input-hashes.json')
owned=[('alex','C3ABC0D4-CFD4-4F23-8CC3-0E542014803A','791f7261-6c9d-4061-9c8a-57aa6e0b0200'),('sam','CA0BCEDE-A297-493A-8921-9E31F8B65783','e5f80cfd-b69a-4aa0-a267-75784e943676')]
restored=[]
for name,sim,actor in owned:
    subprocess.run(['xcrun','simctl','ui',sim,'content_size','large'],check=True)
    subprocess.run(['xcrun','simctl','ui',sim,'appearance','light'],check=True)
    subprocess.run(['xcrun','simctl','launch',sim,'ch.drrius.nest'],check=True,capture_output=True)
    time.sleep(4)
    subprocess.run(['xcrun','simctl','io',sim,'screenshot',str(OUT/(name+'-restored-today.png'))],check=True,capture_output=True)
    current=state(sim);assert current['actor']==actor and current['household']=='be772ffd-3ab5-41d5-8438-647a79a553da'
    restored.append({'simulator':sim,'scope':current,'appearance':'light','contentSize':'large','renewalReadTableIsNotAnIntentJournal':True})
(OUT/'restoration.json').write_text(json.dumps(restored,indent=2)+'\n')
print(json.dumps({'output':str(OUT),'exportedFiles':len([f for f in OUT.rglob('*') if f.is_file()]),'hostedMutations':0}))
