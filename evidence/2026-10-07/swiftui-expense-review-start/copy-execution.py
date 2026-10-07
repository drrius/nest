from pathlib import Path
import fcntl,hashlib,json,os,plistlib,subprocess,sys,time
os.umask(0o077)
common=Path('/private/tmp/nest-native-expense-review-copy-prepare-20261007.py').read_text().split("lock=open(")[0]
exec(compile(common,'audited-native-portion-common','exec'))

def run(step,actor):
    assert step in ['normal','maximum'] and actor in ['alex','sam']
    frozen_inputs();prep=json.loads((OUT/'prepared.json').read_text());assert prep['prepared'] and prep['source']==SOURCE
    before=scopes();settings=ui_settings();assert before==prep['before'] and settings==prep['settings'] and original_view_state()==prep['local']
    sdk=False;sim=PRIMARY if actor=='alex' else PARTNER
    plan,proof=products();assert proof==json.loads((OUT/'products.json').read_text())
    suite='NestAccessibilityTests'
    methods=['NativeExpenseReviewStartTests/testOwnedReviewStartsAtAmountAndEditRetainsDraftWithoutSaving']
    env={'NEST_QA_NAME':'Test Alex' if actor=='alex' else 'Test Sam','NEST_QA_POSITIVE_BUDGET':'0','NEST_QA_API_ORIGIN':'https://nest-test-api-drrius-projects.vercel.app','NEST_QA_SUPABASE_ORIGIN':'https://tkjixmujjoustdiedfmw.supabase.co','NEST_QA_EXPENSE_REVIEW_START':'20261007-no-save'}
    case=OUT/(step+'-'+actor);assert not case.exists();case.mkdir(mode=0o700)
    plan[suite].setdefault('EnvironmentVariables',{}).update(env)
    selected=case/'selected.xctestrun';selected.write_bytes(plistlib.dumps(plan));selected.chmod(0o600)
    summary=None;restored=False;attempted=False
    awake=subprocess.Popen(['caffeinate','-dimsu','-t','1200'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        if step=='maximum':
            subprocess.run(['xcrun','simctl','ui',sim,'appearance','dark'],check=True)
            subprocess.run(['xcrun','simctl','ui',sim,'content_size','accessibility-extra-extra-extra-large'],check=True)
        (case/'invocation-consumed.json').write_text(json.dumps({'source':SOURCE,'testBuiltSource':SOURCE,'actor':actor,'step':step,'methods':methods,'positiveBudget':0})+'\n')
        with (case/'test.log').open('w') as log:
            attempted=True
            result=subprocess.run(['xcodebuild','-xctestrun',str(selected),'-destination','platform=iOS Simulator,id='+sim,'-parallel-testing-enabled','NO','-resultBundlePath',str(case/'result.xcresult'),*['-only-testing:'+suite+'/'+method for method in methods],'test-without-building'],stdout=log,stderr=subprocess.STDOUT)
        summary=json.loads(subprocess.check_output(['xcrun','xcresulttool','get','test-results','summary','--path',str(case/'result.xcresult')],text=True))
        (case/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
        print(json.dumps({'step':step,'actor':actor,'exit':result.returncode,'passed':summary['passedTests'],'failed':summary['failedTests'],'skipped':summary['skippedTests']}),flush=True)
    finally:
        try:
            assert restore(settings)==before and ui_settings()==settings and original_view_state()==prep['local']
            for device,label in [(PRIMARY,'alex'),(PARTNER,'sam')]:subprocess.run(['xcrun','simctl','io',device,'screenshot',str(case/(label+'-final.png'))],check=True,capture_output=True)
            restored=True
        finally:
            selected.unlink(missing_ok=True);awake.terminate();awake.wait()
            (case/'terminal.json').write_text(json.dumps({'source':SOURCE,'testBuiltSource':SOURCE,'attempted':attempted,'summaryRecorded':summary is not None,'restorationPassed':restored,'methodPassed':summary is not None and [summary[k] for k in ['passedTests','failedTests','skippedTests']]==[len(methods),0,0],'explicitSaveCalls':0,'authorizedSaveBudget':0,'apiRequestsMeasured':sdk},indent=2)+'\n')

lock=open('/private/tmp/nest-food-controls-ui-actor.lock','a+')
fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
assert len(sys.argv)==3
run(sys.argv[1],sys.argv[2])
