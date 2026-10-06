from pathlib import Path

import fcntl,hashlib,json,os,plistlib,sqlite3,subprocess,sys,time

PRIMARY='C3ABC0D4-CFD4-4F23-8CC3-0E542014803A'

PARTNER='CA0BCEDE-A297-493A-8921-9E31F8B65783'

ACTOR='791f7261-6c9d-4061-9c8a-57aa6e0b0200'

PEER='e5f80cfd-b69a-4aa0-a267-75784e943676'

HOUSEHOLD='be772ffd-3ab5-41d5-8438-647a79a553da'

OUT=Path('/private/tmp/nest-quiet-card-eager-20261006')

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

lock=open('/private/tmp/nest-food-controls-ui-actor.lock','a+')
fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
prep=json.loads((OUT/'prepared.json').read_text())
for sim in [PRIMARY,PARTNER]:
    for key,value in prep['settings'][sim].items():subprocess.run(['xcrun','simctl','ui',sim,key,value],check=True)
    subprocess.run(['xcrun','simctl','launch',sim,'ch.drrius.nest'],check=True,capture_output=True)
time.sleep(10)
after=settled_scopes('independent-restoration');assert after==prep['before']
assert ui_settings()==prep['settings'] and original_view_state()==prep['local']
for sim,name in [(PRIMARY,'alex'),(PARTNER,'sam')]:subprocess.run(['xcrun','simctl','io',sim,'screenshot',str(OUT/(name+'-independent-final.png'))],check=True,capture_output=True)
assert not (OUT/'selected.xctestrun').exists()
proof={'originalScopes64AndSettingsVerified':True,'localSemanticsUnchanged':True,'ordinaryForegroundLaunch':True,'suiteReplayed':False,'selectedPlanAbsent':True,'earlierControllerRestorationPassed':False}
(OUT/'independent-restoration.json').write_text(json.dumps(proof,indent=2)+'\n')
subprocess.run(['xcrun','xcresulttool','export','attachments','--path',str(OUT/'audit.xcresult'),'--output-path',str(OUT/'attachments')],check=True,capture_output=True)
print(json.dumps(proof),flush=True)
