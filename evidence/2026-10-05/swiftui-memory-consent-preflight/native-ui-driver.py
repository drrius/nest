from pathlib import Path
import json,sys,subprocess,sqlite3,hashlib,plistlib,fcntl,time,datetime
exec(Path('/private/tmp/nest-private-memory-ui-20261005.py').read_text().rsplit('\nphase=sys.argv[1]',1)[0])
ROOT=Path('/private/tmp/nest-memory-preflight-ui-20261005')
phase=sys.argv[1]
if phase=='install':
 assert not ROOT.exists();ROOT.mkdir(mode=0o700);empty();before=state()
 m=json.loads(Path('/private/tmp/nest-memory-preflight-fixed-inputs-20261005.json').read_text());src=Path('/private/tmp/nest-current-qa-82a')
 assert len(m['files'])==1043 and all(hashlib.sha256((src/p).read_bytes()).hexdigest()==h for p,h in m['files'].items())
 v=json.loads(Path('/private/tmp/nest-memory-preflight-fixed-build-20261005/verification.json').read_text());assert v['nativeExit']==0 and v['signingExit']==0
 app=Path('/private/tmp/nest-swiftui-planned-qa/Build/Products/Debug-iphonesimulator/Nest.app');info=plistlib.loads((app/'Info.plist').read_bytes())
 assert info['NEST_API_URL']=='https://nest-test-api-drrius-projects.vercel.app' and info['NEST_SUPABASE_URL']=='https://tkjixmujjoustdiedfmw.supabase.co' and str(info['NEST_PUSH_ENABLED']).lower() in ['false','no','0']
 candidate=hashlib.sha256((app/info['CFBundleExecutable']).read_bytes()).hexdigest()
 subprocess.run(['xcrun','simctl','terminate',SIM,'ch.drrius.nest'],capture_output=True)
 subprocess.run(['xcrun','simctl','install',SIM,str(app)],capture_output=True,check=True)
 subprocess.run(['xcrun','simctl','launch',SIM,'ch.drrius.nest'],capture_output=True,check=True)
 assert state()==before
 installed=Path(subprocess.check_output(['xcrun','simctl','get_app_container',SIM,'ch.drrius.nest','app'],text=True).strip())
 subprocess.run(['codesign','--verify','--deep','--strict',str(installed)],capture_output=True,check=True)
 assert hashlib.sha256((installed/info['CFBundleExecutable']).read_bytes()).hexdigest()==candidate
 save('installed.json',{'all1043InputsMatch':True,'signatureValid':True,'stableTestOrigins':True,'pushDisabled':True,'dataAndKeychainPreserved':True,'all64JournalsEmpty':True,'executableSHA256':candidate})
 subprocess.run(['xcrun','simctl','ui',SIM,'content_size','large'],capture_output=True,check=True)
 subprocess.run(['xcrun','simctl','ui',SIM,'appearance','light'],capture_output=True,check=True)
 device('scroll','top','--settle');click('Profile and preferences');click('Private memory',budget=16);capture('empty-normal');print('Exact source-matched signed native memory screen opened;64 empty journals and original fixture session preserved')
elif phase=='propose-once':
 empty();assert not (ROOT/'review-intent.json').exists();corner('Add','add');text=json.loads(Path('/private/tmp/nest-memory-preflight-plan-20261005.json').read_text())['text'];enter('Memory text',text);assert field_value('Memory text')==text
 capture('editor1000-keyboard');save('review-intent.json',{'oneNativeProposalOnly':True,'exactLength':len(text),'time':time.time()});corner('Review memory text','review')
 for _ in range(30):
  v=checked()
  if v and 'proposal' in v.get('response',{}):break
  time.sleep(.5)
 assert v and 'proposal' in v.get('response',{}) and v['request']['proposal']['_0']['content']==text
 save('native-proposal.json',v);capture('proposal-normal');print('One native Review created the exact1000-character private pending proposal; no save consent')
elif phase=='propose-chunked-once':
 empty();assert not (ROOT/'review-intent.json').exists();assert (ROOT/'runner-recovery.json').exists()
 device('scroll','top','--settle');click('Profile and preferences');click('Private memory',budget=16);corner('Add','add-after-runner-recovery')
 text=json.loads(Path('/private/tmp/nest-memory-preflight-plan-20261005.json').read_text())['text'];assert field_value('Memory text') in ['',None,'What should Nest remember?']
 n=find('Memory text',types=('TextField','TextView'));device('press','@'+n['ref'],'--settle')
 for end in range(100,1001,100):
  previous='' if end==100 else text[:end-100];observed=field_value('Memory text');assert observed in ([None,'','What should Nest remember?'] if not previous else [previous])
  r=subprocess.run(CLI+['type',text[end-100:end],'--delay-ms','1','--udid',SIM,'--session','nest-smallest-clean','--json'],capture_output=True,text=True,timeout=60);v=json.loads(r.stdout);assert v.get('success'),v.get('error')
  assert field_value('Memory text')==text[:end],'Inspect partial draft; never repeat chunk blindly'
  save('chunk-'+str(end)+'.json',{'exactPrefixLength':end,'noReviewOrSave':True,'time':time.time()})
 assert field_value('Memory text')==text;capture('editor1000-keyboard');save('review-intent.json',{'oneNativeProposalOnly':True,'exactLength':len(text),'time':time.time()});corner('Review memory text','review')
 for _ in range(30):
  v=checked()
  if v and 'proposal' in v.get('response',{}):break
  time.sleep(.5)
 assert v and 'proposal' in v.get('response',{}) and v['request']['proposal']['_0']['content']==text
 save('native-proposal.json',v);capture('proposal-normal');print('One native Review created the exact1000-character private pending proposal after verified keyboard chunks; no save consent')
elif phase=='propose-pasted-once':
 empty();assert not (ROOT/'review-intent.json').exists();assert not (ROOT/'paste-recovery.json').exists()
 save('paste-recovery.json',{'failedNativeTyping1000And100BeforeReview':True,'noSavedMutationRepeated':True,'time':time.time()})
 device('close','ch.drrius.nest');device('open','ch.drrius.nest','--foreground')
 device('scroll','top','--settle');click('Profile and preferences');click('Private memory',budget=16);corner('Add','add-after-keyboard-watchdog')
 text=json.loads(Path('/private/tmp/nest-memory-preflight-plan-20261005.json').read_text())['text'];assert field_value('Memory text') in ['',None,'What should Nest remember?']
 subprocess.run(['xcrun','simctl','pbcopy',SIM],input=text,text=True,capture_output=True,check=True)
 n=find('Memory text',types=('TextField','TextView'));r=n['rect'];device('longpress',str(r['x']+25),str(r['y']+25),'800','--settle');capture('native-paste-menu');short()
elif phase=='paste-and-review-once':
 empty();assert not (ROOT/'review-intent.json').exists();assert (ROOT/'paste-recovery.json').exists()
 n=find('Paste',types=('Button','StaticText'));device('press','@'+n['ref'],'--settle')
 text=json.loads(Path('/private/tmp/nest-memory-preflight-plan-20261005.json').read_text())['text'];observed=field_value('Memory text');assert len(observed)==512 and observed==text[:512]
 clipboard=subprocess.check_output(['xcrun','simctl','pbpaste',SIM],text=True);assert clipboard==text
 save('native-paste-observer-bound.json',{'observedPrefixLength':512,'exactExpectedPrefix':True,'exactClipboardLength':1000,'fullCommandMustBeVerifiedAfterReview':True,'time':time.time()})
 subprocess.run(['xcrun','simctl','pbcopy',SIM],input='',text=True,capture_output=True,check=True)
 capture('editor1000-native-pasted-keyboard');save('review-intent.json',{'oneNativeProposalOnly':True,'exactLength':len(text),'actualNativePaste':True,'time':time.time()});corner('Review memory text','review')
 for _ in range(30):
  v=checked()
  if v and 'proposal' in v.get('response',{}):break
  time.sleep(.5)
 assert v and 'proposal' in v.get('response',{}) and v['request']['proposal']['_0']['content']==text
 save('native-proposal.json',v);capture('proposal-normal');print('One native Review created the exact1000-character private pending proposal after actual native Paste; clipboard cleared; no save consent')
elif phase=='review-existing-paste-once':
 empty();assert not (ROOT/'review-intent.json').exists();assert (ROOT/'native-paste-observed.json').exists()
 text=json.loads(Path('/private/tmp/nest-memory-preflight-plan-20261005.json').read_text())['text'];observed=field_value('Memory text');assert len(observed)==512 and observed==text[:512]
 clipboard=subprocess.check_output(['xcrun','simctl','pbpaste',SIM],text=True);assert clipboard==text
 save('native-paste-observer-bound.json',{'observedPrefixLength':512,'exactExpectedPrefix':True,'exactClipboardLength':1000,'noPasteRepeated':True,'fullCommandMustBeVerifiedAfterReview':True,'time':time.time()})
 subprocess.run(['xcrun','simctl','pbcopy',SIM],input='',text=True,capture_output=True,check=True)
 capture('editor1000-native-pasted-keyboard');save('review-intent.json',{'oneNativeProposalOnly':True,'exactLength':len(text),'actualNativePaste':True,'time':time.time()});corner('Review memory text','review')
 for _ in range(30):
  v=checked()
  if v and 'proposal' in v.get('response',{}):break
  time.sleep(.5)
 assert v and 'proposal' in v.get('response',{}) and v['request']['proposal']['_0']['content']==text
 save('native-proposal.json',v);capture('proposal-normal');print('One native Review created the exact1000-character private pending proposal from the existing native Paste; no input or save repeated')
elif phase=='install-clock':
 before=checked();assert before and 'proposal' in before.get('response',{});assert not (ROOT/'clock-installed.json').exists()
 m=json.loads(Path('/private/tmp/nest-memory-expiry-clock-inputs-20261005.json').read_text());src=Path('/private/tmp/nest-current-qa-82a');assert len(m['files'])==1043 and all(hashlib.sha256((src/p).read_bytes()).hexdigest()==h for p,h in m['files'].items())
 v=json.loads(Path('/private/tmp/nest-memory-expiry-clock-build-20261005/verification.json').read_text());assert v['nativeExit']==0 and v['signingExit']==0
 app=Path('/private/tmp/nest-swiftui-planned-qa/Build/Products/Debug-iphonesimulator/Nest.app');info=plistlib.loads((app/'Info.plist').read_bytes());assert info['NEST_API_URL']=='https://nest-test-api-drrius-projects.vercel.app' and info['NEST_SUPABASE_URL']=='https://tkjixmujjoustdiedfmw.supabase.co' and str(info['NEST_PUSH_ENABLED']).lower() in ['false','no','0']
 sha=hashlib.sha256((app/info['CFBundleExecutable']).read_bytes()).hexdigest();save('before-client-update.json',before)
 subprocess.run(['xcrun','simctl','terminate',SIM,'ch.drrius.nest'],capture_output=True);subprocess.run(['xcrun','simctl','install',SIM,str(app)],capture_output=True,check=True);subprocess.run(['xcrun','simctl','launch',SIM,'ch.drrius.nest'],capture_output=True,check=True);assert checked()==before
 installed=Path(subprocess.check_output(['xcrun','simctl','get_app_container',SIM,'ch.drrius.nest','app'],text=True).strip());subprocess.run(['codesign','--verify','--deep','--strict',str(installed)],capture_output=True,check=True);assert hashlib.sha256((installed/info['CFBundleExecutable']).read_bytes()).hexdigest()==sha
 device('scroll','top','--settle');click('Profile and preferences');click('Private memory',budget=16);assert checked()==before
 find('Save this memory',budget=30);capture('clock-live-review-controls');save('clock-installed.json',{'all1043InputsMatch':True,'onlyUIViewDeadlineUpdate':True,'actualSignedBuildForTesting':True,'noNewXCTestClaim':True,'stableTestOrigins':True,'pushDisabled':True,'sameExactPendingRequestAndScope':True,'dataAndKeychainPreserved':True,'executableSHA256':sha,'time':time.time()});print('Signed deadline-update client preserves exact1000-character pending proposal; actual live Save control inspected before expiry')
elif phase=='expired-held-open':
 before=checked();assert before and 'proposal' in before.get('response',{});a=before['response']['proposal']['_0']['approval'];deadline=datetime.datetime.fromisoformat(a['expiresAt'].replace('Z','+00:00')).timestamp();assert time.time()>deadline+3
 assert (ROOT/'clock-installed.json').exists();assert not (ROOT/'expired-restart-intent.json').exists()
 ns=nodes();assert not any(n.get('type')=='Button' and n.get('label') in ['Save this memory','Don’t save'] for n in ns),'Held-open expired screen still offers consent'
 find('Discard expired proposal',budget=30);assert checked()==before;capture('expired-held-open');save('expired-held-open.json',{'noRestartReloadOrConsentAfterDeadline':True,'sameExactPendingRequest':True,'SaveAndDeclineAbsent':True,'explicitDiscardAvailable':True,'deadline':deadline,'time':time.time()});print('Actual held-open view automatically switches to explicit Discard at the real deadline; no network or staged decision')
elif phase=='display':
 checked();subprocess.run(['xcrun','simctl','ui',SIM,'content_size',sys.argv[2]],capture_output=True,check=True);subprocess.run(['xcrun','simctl','ui',SIM,'appearance',sys.argv[3]],capture_output=True,check=True);device('scroll',sys.argv[4],'--settle');capture(sys.argv[5]);short()
elif phase=='expired-restart':
 before=checked();assert before and 'proposal' in before.get('response',{});a=before['response']['proposal']['_0']['approval'];deadline=datetime.datetime.fromisoformat(a['expiresAt'].replace('Z','+00:00')).timestamp();assert time.time()>deadline+2,'Wait for actual hosted approval deadline; never alter it'
 assert not (ROOT/'expired-restart-intent.json').exists();save('expired-restart-intent.json',{'request':before,'deadline':deadline,'time':time.time(),'noDecisionSent':True})
 subprocess.run(['xcrun','simctl','terminate',SIM,'ch.drrius.nest'],capture_output=True);subprocess.run(['xcrun','simctl','launch',SIM,'ch.drrius.nest'],capture_output=True,check=True)
 device('scroll','top','--settle');click('Profile and preferences');click('Private memory',budget=16)
 assert checked()==before;device('scroll','top','--settle');capture('expired-top');device('scroll','bottom','--settle');n=find('Discard expired proposal');r=n['rect'];assert r['width']>=44 and r['height']>=44
 assert not any(n.get('label') in ['Save this memory','Don’t save'] and n.get('type')=='Button' for n in nodes());capture('expired-bottom');print('Actual expired pending proposal survives restart unchanged; explicit Discard is available and Save/Don’t save absent')
elif phase=='discard-once':
 before=checked();assert before and 'proposal' in before.get('response',{});assert not (ROOT/'discard-intent.json').exists();save('discard-intent.json',{'request':before,'time':time.time(),'oneExplicitNativeDiscard':True});corner('Discard expired proposal','expired-discard')
 for _ in range(20):
  if checked() is None:break
  time.sleep(.5)
 empty();capture('expired-discarded');print('One explicit native Discard cleared only local expired proposal;64 journals empty')
elif phase=='restore':
 empty();subprocess.run(['xcrun','simctl','ui',SIM,'content_size','large'],capture_output=True,check=True);subprocess.run(['xcrun','simctl','ui',SIM,'appearance','light'],capture_output=True,check=True);back('Profile');click('Today');device('scroll','top','--settle');capture('restored');print('Ordinary Today/default text/light and64 empty journals restored; test origins/data/Keychain preserved')
elif phase=='inspect':checked();capture(sys.argv[2]);short()
else:raise AssertionError(phase)
