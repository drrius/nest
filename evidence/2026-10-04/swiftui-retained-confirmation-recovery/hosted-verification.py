from pathlib import Path
import json,time,sys
exec(Path('/tmp/nest-history-page-api.py').read_text().rsplit('mode=sys.argv[1]',1)[0])
def canonical(value,key=None):
 if isinstance(value,dict):return {k:canonical(v,k) for k,v in value.items()}
 if isinstance(value,list):return [canonical(v) for v in value]
 if key in ['draftId','ruleId','payerId','memberId'] and value is not None:return str(uuid.UUID(value))
 return value
book=Path('/tmp/nest-retained-confirmation-hosted-state.json');s=json.loads(book.read_text());p=s['plan']
registry=json.loads(Path('/tmp/nest-retained-confirmation-operations.json').read_text());assert len(registry)==1
op,command=next(iter(registry.items()));assert command['operationId'].lower()==op
code,result=request(owner,'/v1/money/recurring/legacy-confirmation/receipt?operationId='+op)
assert code==200 and result['status']=='recorded' and result['actorId']==A and result['householdId']==HH
receipt=result['receipt'];assert canonical(receipt['input'])==canonical(command['input']) and receipt['reviewed']==s['before'][A]['contexts']['confirmationDraft'] and receipt['approvalId'] is None
assert receipt['status']=='posted' and receipt['operationId']==op
newId=receipt['eventId'];after={}
for u in [owner,partner]:
 m=money(u);old=s['before'][u['id']]['money'];assert m['balance']['eventCount']=='52'
 prev={e['eventId']:e for pg in old['pages'] for e in pg['events']};now={e['eventId']:e for pg in m['pages'] for e in pg['events']}
 assert set(now)==set(prev)|{newId} and all(now[k]==v for k,v in prev.items())
 balances={x['actorId']:int(x['centimes']) for x in m['balance']['members']};assert balances=={A:103,B:-103}
 code,detail=request(u,'/v1/money/detail?eventId='+newId);assert code==200
 assert detail['event']['description']=='Synthetic retained expense' and detail['event']['amountCentimes']=='3' and detail['event']['payerId']==A and detail['event']['occurredOn']=='2026-10-04'
 assert {x['memberId']:(x['allocatedCentimes'],x['deltaCentimes']) for x in detail['shares']}=={A:('2','1'),B:('1','-1')}
 code,rules=request(u,'/v1/money/recurring/legacy');assert code==200
 oldRules=s['before'][u['id']]['rules'];assert all(rules[k]==v for k,v in oldRules.items() if k!='rules') and len(rules['rules'])==1
 oldRule=oldRules['rules'][0];newRule=rules['rules'][0];assert all(newRule[k]==v for k,v in oldRule.items() if k!='drafts')
 expectedCounts=dict(oldRule['drafts'],pending='1',posted='1');assert newRule['drafts']==expectedCounts
 code,drafts=request(u,'/v1/money/recurring/legacy-drafts?ruleId='+p['rule']);assert code==200
 oldDrafts={x['draftId']:x for x in s['before'][u['id']]['drafts']['drafts']};newDrafts={x['draftId']:x for x in drafts['drafts']}
 assert newDrafts[p['dismissalDraft']]==oldDrafts[p['dismissalDraft']]
 converted=newDrafts[p['confirmationDraft']];assert converted['status']=='posted' and converted['eventId']==newId
 assert all(converted[k]==v for k,v in oldDrafts[p['confirmationDraft']].items() if k not in ['status','eventId','updatedAt'])
 after[u['id']]={'money':m,'detail':detail,'rules':rules,'drafts':drafts}
assert after[A]==after[B]
code,other=request(partner,'/v1/money/recurring/legacy-confirmation/receipt?operationId='+op)
assert code==200 and other['status']=='unresolved' and other['receipt'] is None and other['actorId']==B
isolation=[]
for path in ['/v1/money/recurring/legacy-confirmation/receipt?operationId='+op,'/v1/money/detail?eventId='+newId,'/v1/money/recurring/legacy-drafts?ruleId='+p['rule']]:
 code,_=request(outsider,path);anon,_=request(None,path);assert code==403 and anon==401
 isolation.append({'path':path,'outsider':code,'anonymous':anon})
s.update({'after':after,'receipt':result,'partnerPrivateReceipt':other,'afterIsolation':isolation,'confirmedExactlyOneEvent':True,'finished':time.time()});book.write_text(json.dumps(s,indent=2)+'\n')
Path('/tmp/nest-retained-confirmation-after-proof.json').write_text(json.dumps({'project':p['project'],'household':HH,'operation':op,'event':newId,'previousEventsUnchanged':51,'totalEvents':52,'balancesCentimes':{A:103,B:-103},'newExpenseCentimes':3,'newSharesCentimes':{A:2,B:1},'originalDraftCentimesPreserved':101,'otherDraftUnchanged':True,'inactiveLegacyRuleUnchanged':True,'membersAgree':True,'ownerReceiptRecorded':True,'partnerReceiptUnresolved':True,'isolation':isolation,'productionTouched':False,'time':time.time()},indent=2)+'\n')
print('Exactly one new CHF0.03 event, original51 events unchanged,103/-103 balances, originalCHF1.01 draft terms retained, other draft and inactive rule unchanged; private receipt isolation passes.',flush=True)
