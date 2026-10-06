from pathlib import Path
import json,re
rows=json.loads(Path('/private/tmp/nest-active-renewal-scope-host-private-20261006.json').read_text())
out=[]
for row in rows:
    message=row.get('eventMessage','')
    tasks=[a+'.'+b for a,b in re.findall(r'Task <([A-Fa-f0-9-]+)>[.]<([0-9]+)>',message)]
    paths=re.findall(r'https://(?:nest-test-api-drrius-projects.vercel.app|tkjixmujjoustdiedfmw.supabase.co)(/auth/v1/token|/v1/[a-z0-9/_-]+)',message)
    codes=re.findall(r'(?:status|response)[: =]+([1-5][0-9]{2})',message,re.I)
    connections=sorted(set(re.findall(r'\bC[0-9]+(?:[.][0-9]+)*\b',message)))
    if paths or any(task.endswith(('.1','.2','.3','.4')) for task in tasks):
        out.append({'at':row.get('timestamp'),'PID':row.get('processID'),'tasks':tasks,'paths':paths,'connections':connections,'codes':codes,'markers':[v for v in ['resuming','received response','HTTP load complete','finished','using connection'] if v.lower() in message.lower()]})
Path('/private/tmp/nest-active-renewal-safe-task-correlation-20261006.json').write_text(json.dumps(out,indent=2)+'\n')
for event in out:
    if event['paths'] or event['codes'] or event['connections']:print(json.dumps(event))
