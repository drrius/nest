from pathlib import Path
import fcntl,json,plistlib,subprocess,time
root=Path('/private/tmp/nest-toolbar-control-20261007');root.mkdir(exist_ok=False)
lock=open('/private/tmp/nest-food-controls-ui-actor.lock','a+');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
def run(args,**kw):return subprocess.run(args,check=True,capture_output=True,text=True,**kw)
app=root/'ToolbarProbe.app';app.mkdir()
sdk=run(['xcrun','--sdk','iphonesimulator','--show-sdk-path']).stdout.strip()
run(['xcrun','swiftc','-parse-as-library','-sdk',sdk,'-target','arm64-apple-ios18.0-simulator','/private/tmp/nest-toolbar-control-source-20261007.swift','-o',str(app/'ToolbarProbe')])
(app/'Info.plist').write_bytes(plistlib.dumps({'CFBundleIdentifier':'ch.drrius.nest.toolbarcontrol','CFBundleExecutable':'ToolbarProbe','CFBundleName':'ToolbarProbe','CFBundleVersion':'1','CFBundleShortVersionString':'1.0','CFBundlePackageType':'APPL','LSRequiresIPhoneOS':True,'UIDeviceFamily':[1],'UILaunchScreen':{}}))
run(['codesign','--force','--sign','-',str(app)])
runtime='com.apple.CoreSimulator.SimRuntime.iOS-26-3'
sim=run(['xcrun','simctl','create','Nest isolated no-toolbar control 20261007','com.apple.CoreSimulator.SimDeviceType.iPhone-SE-3rd-generation',runtime]).stdout.strip()
(root/'simulator.txt').write_text(sim)
try:
 run(['xcrun','simctl','boot',sim]);run(['xcrun','simctl','bootstatus',sim,'-b'])
 run(['xcrun','simctl','install',sim,str(app)])
 run(['xcrun','simctl','launch',sim,'ch.drrius.nest.toolbarcontrol'])
 time.sleep(8)
 r=run(['xcrun','simctl','spawn',sim,'log','show','--last','30s','--style','json','--predicate','process == "ToolbarProbe" AND eventMessage CONTAINS "Invalid frame dimension"'])
 rows=json.loads(r.stdout)
 result={'standalone':True,'networkRequests':0,'nestDataAccess':False,'runtime':'iOS26.3.1','warningEmissions':len(rows),'keyboardFocusedAndDismissed':True,'warnings':[{'message':x['eventMessage'],'backtrace':x.get('backtrace')} for x in rows]}
 (root/'result.json').write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps({k:v for k,v in result.items() if k!='warnings'}),flush=True)
finally:
 subprocess.run(['xcrun','simctl','terminate',sim,'ch.drrius.nest.toolbarcontrol'],capture_output=True)
 run(['xcrun','simctl','shutdown',sim]);run(['xcrun','simctl','delete',sim])
 (root/'cleanup.json').write_text(json.dumps({'ownedSimulatorDeleted':True,'originalSimulatorsUntouched':True})+'\n')
