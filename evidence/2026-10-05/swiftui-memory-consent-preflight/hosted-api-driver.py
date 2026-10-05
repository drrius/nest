from pathlib import Path
import json,sys,time,hashlib
exec(Path('/tmp/nest-private-memory-api-20261005.py').read_text().rsplit('\nphase=sys.argv[1]',1)[0])
STATE=Path('/tmp/nest-memory-preflight-hosted-20261005.json')
PLAN=Path('/tmp/nest-memory-preflight-plan-20261005.json')
phase=sys.argv[1]
if phase=='before':
 assert not STATE.exists() and not PLAN.exists()
 before=reads();assert before[A]['memories']['memories']==[] and before[B]['memories']['memories']==[]
 text='Fictional QA memory. Keep shared planning suggestions simple. '+('This is temporary private test text, not a household instruction. '*20)
 text=text[:999]+'.';assert len(text)==1000
 STATE.write_text(json.dumps({'before':before,'started':time.time(),'productionTouched':False},indent=2)+'\n');STATE.chmod(0o600)
 PLAN.write_text(json.dumps({'text':text,'actor':A,'household':HH},indent=2)+'\n')
 print('Both active memory lists empty and all61 financial events/balances recorded;1000-character proposal text prepared, no write')
elif phase=='proposal':
 s=json.loads(STATE.read_text());native=json.loads(Path('/tmp/nest-memory-preflight-native-proposal-20261005.json').read_text())
 approval=native['response']['proposal']['_0']['approval'];command=native['request']['proposal']['_0']
 assert command['content']==json.loads(PLAN.read_text())['text'] and approval['status']=='pending'
 status,current=request(owner,'/v1/memories/approval?id='+approval['id']);assert status==200 and current['approval']['status']=='pending'
 assert current['approval']['change']['content']==command['content']
 assert reads()==s['before']
 isolation={}
 for label,u in [('partner',partner),('outsider',outsider),('anonymous',None)]:
  status,value=request(u,'/v1/memories/approval?id='+approval['id']);assert status==(401 if u is None else 403)
  isolation[label]={'status':status}
 s.update({'nativeProposal':native,'hostedProposal':current,'isolation':isolation,'proposalVerified':time.time()});STATE.write_text(json.dumps(s,indent=2)+'\n');STATE.chmod(0o600)
 print('Real1000-character pending private proposal matches native command; no active memory/finance mutation; partner/outsider403 and anonymous401')
elif phase=='after':
 s=json.loads(STATE.read_text());a=s['hostedProposal']['approval'];status,current=request(owner,'/v1/memories/approval?id='+a['id']);assert status==200 and current['approval']==a
 after=reads();assert after==s['before'];s.update({'after':after,'retainedExpiredApproval':current,'finished':time.time()});STATE.write_text(json.dumps(s,indent=2)+'\n');STATE.chmod(0o600)
 print('Expired pending approval history retained unchanged; both active lists and complete61-event finances exactly equal baseline')
else:raise AssertionError(phase)
