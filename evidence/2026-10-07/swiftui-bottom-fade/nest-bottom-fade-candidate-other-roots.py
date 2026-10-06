from pathlib import Path
import fcntl,hashlib,json,os,plistlib,subprocess,time
os.umask(0o077)
common=Path('/private/tmp/nest-native-bottom-fade-candidate-execution-common-20261007.py').read_text().split("lock=open(")[0]
exec(compile(common,'audited-leftovers-controller-common','exec'))
BASE=Path('/private/tmp/nest-native-bottom-fade-candidate-20261007')
OUT=Path('/private/tmp/nest-bottom-fade-candidate-other-roots-20261007')
lock=open('/private/tmp/nest-food-controls-ui-actor.lock','a+')
fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
assert not OUT.exists();OUT.mkdir(mode=0o700)
frozen_inputs();settings=ui_settings();before=scopes();local=original_view_state()
prep=json.loads((BASE/'prepared.json').read_text());assert before==prep['before'] and settings==prep['settings'] and local==prep['local']
plan,proof=products();assert proof=={k:v for k,v in json.loads((BASE/'products.json').read_text()).items() if k!='compileLines'}
(OUT/'products.json').write_text(json.dumps(proof,indent=2)+'\n')
selected=OUT/'selected.xctestrun';selected.write_bytes(plistlib.dumps(plan));selected.chmod(0o600)
summary=None;restored=False
awake=subprocess.Popen(['caffeinate','-dimsu','-t','600'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
    (OUT/'invocation-consumed.json').write_text(json.dumps({'methods':['RootAccessibilityTests/testTodayAccessibility','RootAccessibilityTests/testMealsAccessibility','RootAccessibilityTests/testMoneyAccessibility'],'source':SOURCE,'unfiltered':True,'positiveBudget':0})+'\n')
    with (OUT/'test.log').open('w') as log:
        result=subprocess.run(['xcodebuild','-xctestrun',str(selected),'-destination','platform=iOS Simulator,id='+PRIMARY,'-parallel-testing-enabled','NO','-resultBundlePath',str(OUT/'result.xcresult'),'-only-testing:NestAccessibilityTests/RootAccessibilityTests/testTodayAccessibility','-only-testing:NestAccessibilityTests/RootAccessibilityTests/testMealsAccessibility','-only-testing:NestAccessibilityTests/RootAccessibilityTests/testMoneyAccessibility','test-without-building'],stdout=log,stderr=subprocess.STDOUT)
    summary=json.loads(subprocess.check_output(['xcrun','xcresulttool','get','test-results','summary','--path',str(OUT/'result.xcresult')],text=True))
    (OUT/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
    print(json.dumps({'exit':result.returncode,'passed':summary['passedTests'],'failed':summary['failedTests'],'skipped':summary['skippedTests']}),flush=True)
finally:
    try:
        assert restore(settings)==before and original_view_state()==local and ui_settings()==settings
        for sim,name in [(PRIMARY,'alex'),(PARTNER,'sam')]:subprocess.run(['xcrun','simctl','io',sim,'screenshot',str(OUT/(name+'-final.png'))],check=True,capture_output=True)
        restored=True
    finally:
        selected.unlink(missing_ok=True);awake.terminate();awake.wait()
        (OUT/'terminal.json').write_text(json.dumps({'summaryRecorded':summary is not None,'restorationPassed':restored,'source':SOURCE,'positiveCommands':0,'unfiltered':True},indent=2)+'\n')
