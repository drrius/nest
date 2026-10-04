from pathlib import Path
import json,time
exec(Path('/tmp/nest-history-page-api.py').read_text().rsplit('mode=sys.argv[1]',1)[0])
plan=json.loads(Path('/tmp/nest-retained-populated-fixture-plan.json').read_text());assert plan['project']=='tkjixmujjoustdiedfmw'
book=Path('/tmp/nest-retained-dismissal-hosted-state.json');assert not book.exists(),'Inspect existing fixture book'
baseline=json.loads(Path('/tmp/nest-retained-confirmation-hosted-state.json').read_text())['after'];before={}
for u in [owner,partner]:
 m=money(u);assert m==baseline[u['id']]['money']
 code,rules=request(u,'/v1/money/recurring/legacy');assert code==200 and rules==baseline[u['id']]['rules']
 code,drafts=request(u,'/v1/money/recurring/legacy-drafts?ruleId='+plan['rule']);assert code==200 and drafts==baseline[u['id']]['drafts']
 code,context=request(u,'/v1/money/recurring/legacy-dismissal/context?draftId='+plan['dismissalDraft']);assert code==200
 assert context['draft']['status']=='pending' and context['draft']['eventId'] is None and context['draft']['amountCentimes']=='101'
 before[u['id']]={'money':m,'rules':rules,'drafts':drafts,'context':context}
assert before[A]==before[B]
for u,expected in [(outsider,403),(None,401)]:
 code,_=request(u,'/v1/money/recurring/legacy-dismissal/context?draftId='+plan['dismissalDraft']);assert code==expected
book.write_text(json.dumps({'plan':plan,'before':before,'started':time.time()},indent=2)+'\n')
plan['reviewToken']=before[A]['context']['reviewToken'];Path('/tmp/nest-retained-dismissal-fixture-plan.json').write_text(json.dumps(plan,indent=2)+'\n')
print('Both members: retained pending dismissal draft verified, previous confirmation/complete52-event finance unchanged; outsider403/anonymous401.',flush=True)
