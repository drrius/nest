from pathlib import Path
import fcntl,json,os,sqlite3,subprocess,time
os.umask(0o077)
OUT=Path('/private/tmp/nest-active-renewal-foreground-restoration-20261006');assert not OUT.exists();OUT.mkdir(mode=0o700)
HOUSEHOLD='be772ffd-3ab5-41d5-8438-647a79a553da'
ROLES={'alex':('C3ABC0D4-CFD4-4F23-8CC3-0E542014803A','791f7261-6c9d-4061-9c8a-57aa6e0b0200'),'sam':('CA0BCEDE-A297-493A-8921-9E31F8B65783','e5f80cfd-b69a-4aa0-a267-75784e943676')}
SNAPSHOTS={'chore_snapshots','grocery_snapshots','meal_weeks','planned_recipes','cooking_profiles','food_profiles','ingredient_reviews','meal_preparation_snapshots','money_read_snapshots','recipe_read_snapshots','renewal_read_snapshots'}
def inspect(sim,actor):
 container=Path(subprocess.check_output(['xcrun','simctl','get_app_container',sim,'ch.drrius.nest','data'],text=True).strip())
 files=list((container/'Library/Application Support').glob('nest-offline-*.sqlite'));assert len(files)==1
 database=files[0];info=database.stat();con=sqlite3.connect('file:'+str(database)+'?mode=ro',uri=True)
 try:
  counts={};snapshots={}
  for (table,) in con.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall():
   assert table.replace('_','').isalnum()
   if table in SNAPSHOTS:snapshots[table]=con.execute('SELECT COUNT(*) FROM "'+table+'"').fetchone()[0]
   columns={row[1] for row in con.execute('PRAGMA table_info("'+table+'")')}
   if {'body','actor','household'}.issubset(columns) and table not in SNAPSHOTS:
    counts[table]=con.execute('SELECT COUNT(*) FROM "'+table+'" WHERE body IS NOT NULL AND body != ?',('null',)).fetchone()[0]
  assert len(counts)==64 and all(value==0 for value in counts.values())
  scope=con.execute('SELECT actor,household,lease FROM offline_scope WHERE id=1').fetchone();assert scope is not None
  assert [scope[0].lower(),scope[1].lower()]==[actor,HOUSEHOLD]
  return {'actor':actor,'household':HOUSEHOLD,'lease':scope[2],'emptyJournals':64,'containerIdentity':container.name,'databaseName':database.name,'inode':info.st_ino,'device':info.st_dev,'snapshotCounts':snapshots}
 finally:con.close()
lock=open('/private/tmp/nest-food-controls-ui-actor.lock','a+');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
terminal=json.loads(Path('/private/tmp/nest-active-renewal-phase1-done-20261006/terminal.json').read_text())
assert terminal['DoneObserved'] and terminal['BothCanonicalAfterReadsPassed'] and terminal['AdditionalServerCommands']==0
before={name:inspect(sim,actor) for name,(sim,actor) in ROLES.items()}
awake=subprocess.Popen(['caffeinate','-dimsu','-t','1200'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
 for name,(sim,actor) in ROLES.items():
  subprocess.run(['xcrun','simctl','ui',sim,'content_size','large'],check=True)
  subprocess.run(['xcrun','simctl','ui',sim,'appearance','light'],check=True)
  subprocess.run(['xcrun','simctl','launch',sim,'ch.drrius.nest'],check=True,capture_output=True)
 time.sleep(10)
 after={name:inspect(sim,actor) for name,(sim,actor) in ROLES.items()}
 for name,(sim,actor) in ROLES.items():
  for key in ['databaseName','inode','device','snapshotCounts']:assert before[name][key]==after[name][key]
  subprocess.run(['xcrun','simctl','io',sim,'screenshot',str(OUT/(name+'-today.png'))],check=True,capture_output=True)
 (OUT/'restoration.json').write_text(json.dumps({'before':before,'after':after,'ordinaryForegroundLaunchOnly':True,'all64JournalsEmpty':True,'largeLight':True,'noExtraAcceptanceMethod':True,'noCommand':True,'noSDKAuthDiagnostic':True,'containerRelocationAllowed':True,'ByteIdentityClaimed':False},indent=2)+'\n')
finally:
 awake.terminate();awake.wait()
print('Both ordinary foreground launches complete; exact original scopes and all64 journals preserved',flush=True)
