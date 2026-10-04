from pathlib import Path
import json,time,uuid
exec(Path('/tmp/nest-history-page-api.py').read_text().rsplit('mode=sys.argv[1]',1)[0])
book=Path('/tmp/nest-retained-dismissal-hosted-state.json');s=json.loads(book.read_text());p=s['plan']
registry=json.loads(Path('/tmp/nest-retained-dismissal-operations.json').read_text());assert len(registry)==1
op,command=next(iter(registry.items()));assert str(uuid.UUID(command['operationId']))==op
def canonical(v):return {k:str(uuid.UUID(x)) if k in ['draftId','ruleId'] else x for k,x in v.items()}
code,result=request(owner,'/v1/money/recurring/legacy-dismissal/receipt?operationId='+op);assert code==200 and result['status']=='recorded' and result['actorId']==A and result['householdId']==HH
r=result['receipt'];assert r['operationId']==op and r['status']=='dismissed' and r['approvalId'] is None
assert canonical(r['input'])==canonical(command['input']) and r['reviewed']==s['before'][A]['context']
after={}
for u in [owner,partner]:
 m=money(u);assert m==s['before'][u['id']]['money'],'Any financial mutation is forbidden for dismissal'
 code,rules=request(u,'/v1/money/recurring/legacy');assert code==200
 oldRules=s['before'][u['id']]['rules'];assert all(rules[k]==v for k,v in oldRules.items() if k!='rules') and len(rules['rules'])==1
 old=oldRules['rules'][0];new=rules['rules'][0];assert all(new[k]==v for k,v in old.items() if k!='drafts')
 assert new['drafts']==dict(old['drafts'],pending='0',dismissed='1')
 code,drafts=request(u,'/v1/money/recurring/legacy-drafts?ruleId='+p['rule']);assert code==200
 before={d['draftId']:d for d in s['before'][u['id']]['drafts']['drafts']};now={d['draftId']:d for d in drafts['drafts']}
 assert set(now)==set(before) and now[p['confirmationDraft']]==before[p['confirmationDraft']]
 chosen=now[p['dismissalDraft']];assert chosen['status']=='dismissed' and chosen['eventId'] is None
 assert all(chosen[k]==v for k,v in before[p['dismissalDraft']].items() if k not in ['status','updatedAt'])
 after[u['id']]={'money':m,'rules':rules,'drafts':drafts}
assert after[A]==after[B]
code,other=request(partner,'/v1/money/recurring/legacy-dismissal/receipt?operationId='+op);assert code==200 and other['status']=='unresolved' and other['receipt'] is None
isolation=[]
for path in ['/v1/money/recurring/legacy-dismissal/receipt?operationId='+op,'/v1/money/recurring/legacy-dismissal/context?draftId='+p['dismissalDraft']]:
 code,_=request(outsider,path);anon,_=request(None,path);assert code==403 and anon==401
 isolation.append({'path':path,'outsider':code,'anonymous':anon})
s.update({'after':after,'receipt':result,'partnerPrivateReceipt':other,'isolation':isolation,'allFinancialStateUnchanged':True,'finished':time.time()});book.write_text(json.dumps(s,indent=2)+'\n')
Path('/tmp/nest-retained-dismissal-after-proof.json').write_text(json.dumps({'project':p['project'],'household':HH,'operation':op,'retainedDismissalRecorded':True,'otherDraftUnchanged':True,'all52EventsAndExactBalancesUnchanged':True,'inactiveRuleTermsUnchanged':True,'noLinkedEvent':True,'originalDraftTermsPreserved':True,'ownerRecordedPartnerUnresolved':True,'isolation':isolation,'productionTouched':False,'time':time.time()},indent=2)+'\n')
print('Both members: selected draft dismissed only; original terms/other linked draft/rule untouched; all52 events and103/-103 balances identical; owner-only receipt/isolation pass.',flush=True)
