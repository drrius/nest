from pathlib import Path
import fcntl,hashlib,json,plistlib,subprocess
root=Path('/private/tmp/nest-native-variable-races-20261007')
out=root/'corrected';out.mkdir(exist_ok=False)
lock=open('/private/tmp/nest-food-controls-ui-actor.lock','a+');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
ns={};exec(Path('/private/tmp/nest-native-saved-portion-readback-prepare-20261007.py').read_text().split('lock=open(',1)[0],ns)
def original():
 value={'scopes':ns['scopes'](),'display':ns['ui_settings'](),'choices':ns['original_view_state']()}
 return hashlib.sha256(json.dumps(value,sort_keys=True).encode()).hexdigest()
def run(args):return subprocess.run(args,check=True,text=True,capture_output=True)
before=original()
products=root/'build/Build/Products';files=list(products.glob('*.xctestrun'));assert len(files)==1
plan=plistlib.loads(files[0].read_bytes());suite='NestAppTests';assert suite in plan
plan[suite].update(ns['selected_products'](plan,suite,products))
plan[suite].setdefault('EnvironmentVariables',{})['NEST_QA_LOCAL_VARIABLE_RACE']='http://localhost:43137'
plan[suite]['OnlyTestIdentifiers']=['VariableCycleContentionTests']
selected=out/'selected.xctestrun';selected.write_bytes(plistlib.dumps(plan))
assert not (out/'native-results.xcresult').exists()
sim=run(['xcrun','simctl','create','Nest local variable race 20261007','com.apple.CoreSimulator.SimDeviceType.iPhone-SE-3rd-generation','com.apple.CoreSimulator.SimRuntime.iOS-26-3']).stdout.strip()
(out/'owned-simulator.txt').write_text(sim+'\n')
print(json.dumps({'phase':'owned-simulator-created','simulator':sim}),flush=True)
try:
 run(['xcrun','simctl','boot',sim]);run(['xcrun','simctl','bootstatus',sim,'-b'])
 with (out/'native-tests.log').open('w') as log:
  r=subprocess.run(['xcodebuild','test-without-building','-xctestrun',str(selected),'-destination','platform=iOS Simulator,id='+sim,'-parallel-testing-enabled','NO','-resultBundlePath',str(out/'native-results.xcresult'),'-only-testing:NestAppTests/VariableCycleContentionTests'],stdout=log,stderr=subprocess.STDOUT)
 (out/'execution.json').write_text(json.dumps({'exitCode':r.returncode,'fixtureOnly':True,'hostedConnections':False,'originalStateBefore':before})+'\n')
 print(json.dumps({'phase':'tests-terminal','exitCode':r.returncode}),flush=True)
finally:
 run(['xcrun','simctl','shutdown',sim]);run(['xcrun','simctl','delete',sim])
 after=original();proof={'originalStateMatches':before==after,'before':before,'after':after,'ownedSimulatorDeleted':True}
 (out/'cleanup.json').write_text(json.dumps(proof,indent=2)+'\n')
 assert before==after
 print(json.dumps({'phase':'cleanup',**proof}),flush=True)
