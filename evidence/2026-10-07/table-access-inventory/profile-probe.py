import json,plistlib,urllib.request,urllib.error
from pathlib import Path
info=plistlib.loads(Path('/private/tmp/nest-native-expense-review-copy-ui-20261007/Build/Products/Debug-iphonesimulator/Nest.app/Info.plist').read_bytes())
origin=info['NEST_SUPABASE_URL'];key=info['NEST_SUPABASE_PUBLISHABLE_KEY']
assert origin=='https://tkjixmujjoustdiedfmw.supabase.co' and key.startswith('sb_publishable_')
rows=[]
for schema,table in [('storage','objects'),('private','nest_recurring_job_receipts')]:
 req=urllib.request.Request(origin+'/rest/v1/'+table+'?select=*&limit=0',headers={'apikey':key,'Accept-Profile':schema})
 try:
  with urllib.request.urlopen(req,timeout=20) as response:status=response.status;body=json.load(response)
 except urllib.error.HTTPError as e:status=e.code;body=json.load(e)
 assert status==406 and body.get('code')=='PGRST106'
 rows.append({'profile':schema,'status':status,'code':body['code'],'message':body['message'],'rowLimit':0})
print(json.dumps({'credential':'public publishable key only','readOnly':True,'results':rows},indent=2))
