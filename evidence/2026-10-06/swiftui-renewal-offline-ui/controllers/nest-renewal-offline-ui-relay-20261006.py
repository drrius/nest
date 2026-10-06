from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import base64,datetime,json,os,ssl,threading,urllib.error,urllib.request
os.umask(0o077)
ROOT=Path('/private/tmp/nest-renewal-offline-ui-20261006')
UPSTREAM='https://nest-test-api-drrius-projects.vercel.app'
ACTORS={'791f7261-6c9d-4061-9c8a-57aa6e0b0200','e5f80cfd-b69a-4aa0-a267-75784e943676'}
HH='be772ffd-3ab5-41d5-8438-647a79a553da'
ALLOWED={'/v1/session','/v1/chores/snapshot','/v1/groceries','/v1/meals/week?weekStart=2026-10-05','/v1/money/recurring/due-variable','/v1/money/pending-approvals','/v1/renewals'}
lock=threading.RLock();blocked=set();events=[]
class NoRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args):return None
opener=urllib.request.build_opener(NoRedirects())
def record(value):
    with lock:
        value['at']=datetime.datetime.now(datetime.timezone.utc).isoformat()
        events.append(value)
        (ROOT/'relay-events.json').write_text(json.dumps(events,indent=2)+'\n')
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def send(self,status,data):
        self.send_response(status);self.send_header('Content-Type','application/json')
        self.send_header('Content-Length',str(len(data)));self.end_headers()
        try:self.wfile.write(data)
        except (BrokenPipeError,ConnectionResetError):pass
    def actor(self):
        value=self.headers.get('Authorization','')
        if not value.startswith('Bearer ') or len(value)>8192:return None
        try:
            part=value[7:].split('.')[1]
            claims=json.loads(base64.urlsafe_b64decode(part+'='*(-len(part)%4)))
            if claims.get('iss')!='https://tkjixmujjoustdiedfmw.supabase.co/auth/v1':return None
            return claims['sub'] if claims.get('sub') in ACTORS else None
        except Exception:return None
    def reject(self):
        record({'method':self.command,'forwarded':False,'status':403,'reason':'read-only policy'})
        self.send(403,b'{"error":{"code":"forbidden"}}')
    do_POST=reject;do_PUT=reject;do_PATCH=reject;do_DELETE=reject;do_OPTIONS=reject;do_HEAD=reject
    def do_GET(self):
        actor=self.actor()
        if actor is None or self.path not in ALLOWED or (self.path!='/v1/session' and self.headers.get('X-Nest-Household')!=HH):
            self.reject();return
        with lock:unavailable=actor in blocked and self.path=='/v1/renewals'
        if unavailable:
            record({'actor':actor,'read':self.path,'forwarded':False,'status':503})
            self.send(503,b'{"error":{"code":"unavailable"}}');return
        headers={k:self.headers[k] for k in ['Authorization','X-Nest-Household','Accept'] if k in self.headers}
        request=urllib.request.Request(UPSTREAM+self.path,headers=headers,method='GET')
        try:
            with opener.open(request,timeout=30) as response:status,data=response.status,response.read(1_000_001)
        except urllib.error.HTTPError as error:status,data=error.code,error.read(1_000_001)
        except Exception:status,data=503,b'{"error":{"code":"unavailable"}}'
        event={'actor':actor,'read':self.path,'forwarded':True,'status':status}
        if self.path=='/v1/renewals' and status==200:
            value=json.loads(data)
            assert value['householdId'].lower()==HH and value['renewals']==[] and value['next'] is None
            event['realActiveRenewalCount']=0
            with lock:blocked.add(actor)
            event['subsequentRenewalReadsUnavailable']=True
        record(event);self.send(status,data)
server=ThreadingHTTPServer(('127.0.0.1',4662),Handler);server.daemon_threads=True
context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain(str(ROOT/'localhost.crt'),str(ROOT/'localhost.key'))
server.socket=context.wrap_socket(server.socket,server_side=True)
print('Owned read-only loopback renewal relay ready; no headers or bodies logged.',flush=True)
server.serve_forever()
