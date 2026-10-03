from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import json,urllib.request,urllib.error,uuid,threading
API='https://nest-test-api-drrius-projects.vercel.app'
SB='https://tkjixmujjoustdiedfmw.supabase.co'
HH='be772ffd-3ab5-41d5-8438-647a79a553da'
ROOT=Path('/tmp/nest-b14-hosted-grocery-qa')
assert not ROOT.exists(),'Existing run must be inspected, not restarted'
ROOT.mkdir(mode=0o700)
users={u['label']:u for u in json.loads(Path('/tmp/nest-b14-api-auth-state.json').read_text())}
keys=json.loads(Path('/tmp/nest-test-api-keys.json').read_text())
key=next(k['api_key'] for k in keys if k.get('type')=='publishable')
evidence={'nativeSource':'bded62ec','backendSource':'83a5a015','api':API,'supabaseProject':'tkjixmujjoustdiedfmw','household':HH,'nativeUIExecuted':False,'productionTouched':False,'cases':[]}
def call(label,path,body=None,rest=False):
 headers={'Accept':'application/json','Content-Type':'application/json'}
 if label is not None:headers['Authorization']='Bearer '+users[label]['access_token']
 if rest:headers['apikey']=key
 else:headers['x-nest-household']=HH
 req=urllib.request.Request((SB if rest else API)+path,headers=headers,data=json.dumps(body).encode() if body is not None else None)
 try:
  with urllib.request.urlopen(req,timeout=25) as response:return response.status,json.loads(response.read())
 except urllib.error.HTTPError as error:
  return error.code,json.loads(error.read())
def ok(label,path,body=None,rest=False):
 status,value=call(label,path,body,rest)
 assert status==200,(label,path,status)
 return value
def item(label,target):
 rows=ok(label,'/v1/groceries')['groceries']
 values=[row for row in rows if row['itemId']==target]
 assert len(values)==1,('expected one fictional item',target,len(values))
 return values[0]
def check(row,checked):
 return {'operationId':str(uuid.uuid4()),'itemId':row['itemId'],'expectedVersion':row['version'],'checked':checked,'offlineEpoch':row['offlineEpoch']}
def record(name,details):
 evidence['cases'].append({'name':name,**details})
 (ROOT/'result.json').write_text(json.dumps(evidence,indent=2)+'\n')
 print(name+' passed',flush=True)
for who in ['member-a','member-b']:
 session=ok(who,'/v1/session')
 assert session['member']['userId']==users[who]['id'] and session['member']['householdId']==HH
before={who:ok(who,'/v1/money/balance') for who in ['member-a','member-b']}
fixtures=[]
for scenario in ['converge','opposition','removed']:
 fixtures.append({'scenario':scenario,'command':{'operationId':str(uuid.uuid4()),'itemId':str(uuid.uuid4()),'name':'Nest B14 grocery QA '+scenario+' '+str(uuid.uuid4())[:8],'quantity':'1','unit':'test item','categoryId':None}})
(ROOT/'intent.json').write_text(json.dumps({'fixtures':fixtures},indent=2)+'\n')
for fixture in fixtures:
 receipt=ok('member-a','/v1/groceries/add',fixture['command'])['receipt']
 assert receipt['target']==fixture['command']['itemId'] and receipt['version']=='1' and not receipt['checked']
row=item('member-a',fixtures[0]['command']['itemId'])
commands={who:check(row,True) for who in ['member-a','member-b']}
(ROOT/'converge-commands.json').write_text(json.dumps(commands,indent=2)+'\n')
barrier=threading.Barrier(2)
def simultaneous(who):
 barrier.wait();return who,ok(who,'/v1/groceries/check',commands[who])['receipt']
with ThreadPoolExecutor(max_workers=2) as pool: receipts=dict(pool.map(simultaneous,commands))
assert {r['outcome'] for r in receipts.values()}=={'applied','already_applied'}
assert all(r['checked'] and r['version']=='2' for r in receipts.values())
for who in commands:
 assert ok(who,'/v1/groceries/check',commands[who])['receipt']==receipts[who]
 current=item(who,row['itemId']);assert current['checked'] and current['version']=='2'
changed={**commands['member-a'],'checked':False}
status,result=call('member-a','/v1/groceries/check',changed)
assert status==400 and result['error']['code']=='invalid_request'
assert item('member-a',row['itemId'])['checked']
record('concurrent-compatible-checks-and-exact-replay',{'receipts':receipts,'replayedReceiptsIdentical':True,'changedPayloadStatus':status,'oneVersionAdvance':True})
operation_filter=','.join(c['operationId'] for c in commands.values())
query='/rest/v1/nest_grocery_check_receipts?select=actor_id,household_id,operation_id&operation_id=in.('+operation_filter+')'
visibility={}
for who in ['member-a','member-b','outsider']:
 rows=ok(who,query,rest=True)
 if who=='outsider':assert rows==[]
 else:assert len(rows)==1 and rows[0]['actor_id']==users[who]['id'] and rows[0]['household_id']==HH and rows[0]['operation_id']==commands[who]['operationId']
 visibility[who]=len(rows)
record('direct-postgrest-private-receipt-rls',{'visibleReceiptCounts':visibility})
row=item('member-a',fixtures[1]['command']['itemId']);stale=check(row,True)
(ROOT/'stale-command.json').write_text(json.dumps(stale,indent=2)+'\n')
first=ok('member-b','/v1/groceries/check',check(row,True))['receipt'];assert first['version']=='2'
second=ok('member-b','/v1/groceries/check',check(item('member-b',row['itemId']),False))['receipt'];assert second['version']=='3'
status,value=call('member-a','/v1/groceries/check',stale)
assert status==409 and value['error']['code']=='conflict'
for who in ['member-a','member-b']:
 current=item(who,row['itemId']);assert not current['checked'] and current['version']=='3'
status,retry=call('member-a','/v1/groceries/check',stale);assert status==409 and retry==value
record('stale-opposing-intent-is-not-silently-applied',{'staleCommand':stale,'status':status,'canonicalChecked':False,'canonicalVersion':'3','sameIntentRemainsConflict':True})
row=item('member-a',fixtures[2]['command']['itemId']);removed_check=check(row,True)
remove={'operationId':str(uuid.uuid4()),'itemId':row['itemId'],'expectedVersion':row['version']}
(ROOT/'removed-commands.json').write_text(json.dumps({'remove':remove,'check':removed_check},indent=2)+'\n')
receipt=ok('member-b','/v1/groceries/remove',remove)['receipt'];assert receipt['removed']
status,value=call('member-a','/v1/groceries/check',removed_check);assert status==410 and value['error']['code']=='removed'
for who in ['member-a','member-b']:assert not any(r['itemId']==row['itemId'] for r in ok(who,'/v1/groceries')['groceries'])
record('removed-target-is-not-resurrected',{'status':status,'absentForBothMembers':True})
probe=check(item('member-a',fixtures[1]['command']['itemId']),True)
outsider_status,_=call('outsider','/v1/groceries/check',probe)
anonymous_status,_=call(None,'/v1/groceries/check',probe)
assert outsider_status==403 and anonymous_status==401
for who in ['member-a','member-b']:
 current=item(who,probe['itemId']);assert not current['checked'] and current['version']=='3'
query='/rest/v1/grocery_items?select=id&household_id=eq.'+HH+'&id=in.('+','.join(f['command']['itemId'] for f in fixtures)+')'
assert ok('outsider',query,rest=True)==[]
record('api-and-direct-rls-tenant-isolation',{'outsiderMutationStatus':outsider_status,'anonymousMutationStatus':anonymous_status,'outsiderRows':0,'canonicalStateUnchanged':True})
after={who:ok(who,'/v1/money/balance') for who in ['member-a','member-b']}
assert before==after
record('checking-groceries-does-not-post-money',{'balancesIdentical':True,'eventCounts':{who:after[who]['eventCount'] for who in after},'financialWritesSent':0})
cleanup=[]
for fixture in fixtures[:2]:
 current=item('member-a',fixture['command']['itemId'])
 command={'operationId':str(uuid.uuid4()),'itemId':current['itemId'],'expectedVersion':current['version']}
 cleanup.append(command)
(ROOT/'cleanup-intent.json').write_text(json.dumps(cleanup,indent=2)+'\n')
for command in cleanup:
 receipt=ok('member-a','/v1/groceries/remove',command)['receipt'];assert receipt['removed']
for who in ['member-a','member-b']:
 rows=ok(who,'/v1/groceries')['groceries']
 assert not any(row['itemId'] in {f['command']['itemId'] for f in fixtures} for row in rows)
record('normal-command-fixture-cleanup',{'createdFixtures':3,'removedFixtures':3,'activeRowsRemaining':0,'financialHistoryUntouched':True})
print('Seven bounded real hosted grocery cases pass; native outage/restart remains unverified',flush=True)
