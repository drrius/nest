from pathlib import Path
import fcntl,hashlib,json,os,plistlib,subprocess,sys,time
os.umask(0o077)
common=Path('/private/tmp/nest-native-setup-actions-prepare-20261007.py').read_text().split("lock=open(")[0]
exec(compile(common,'audited-native-portion-common','exec'))

def sdk_products():
    sdk=Path('/private/tmp/nest-native-setup-sdk-20261007')
    paths=list((sdk/'Build/Products').glob('Nest_*.xctestrun'));assert len(paths)==1
    plan=absolute(plistlib.loads(paths[0].read_bytes()),paths[0].parent)
    expected=json.loads((OUT/'sdk-products.json').read_text());assert expected['source']=='dad2f4be2032c4806bbc3ff1b203fbdc5eb8d0e2'
    assert selected_products(plan,'NestAppTests',paths[0].parent)==expected['selectedProducts']
    for p,h in expected['binarySHA256'].items():assert hashlib.sha256((sdk/p).read_bytes()).hexdigest()==h
    return plan

def run(step,actor):
    assert step in ['before','normal','maximum','after'] and actor in ['alex','sam']
    frozen_inputs();prep=json.loads((OUT/'prepared.json').read_text());assert prep['prepared'] and prep['source']==SOURCE
    before=scopes();settings=ui_settings();assert before==prep['before'] and settings==prep['settings'] and original_view_state()==prep['local']
    sdk=step in ['before','after'];sim=PRIMARY if actor=='alex' else PARTNER;name='Test Alex' if actor=='alex' else 'Test Sam'
    plan=sdk_products() if sdk else products()[0]
    if not sdk:assert products()[1]=={k:v for k,v in json.loads((OUT/'products.json').read_text()).items() if k!='compileLines'}
    if not sdk:
        for member in ['alex','sam']:
            baseline=json.loads((OUT/('before-'+member)/'summary.json').read_text());terminal=json.loads((OUT/('before-'+member)/'terminal.json').read_text())
            assert [baseline[k] for k in ['passedTests','failedTests','skippedTests']]==[1,0,0] and terminal['restorationPassed']
    suite='NestAppTests' if sdk else 'NestAccessibilityTests'
    method='HostedSetupJourneyReadTests/testOwnedSetupStatusReadOnly' if sdk else 'NativeSetupJourneyTests/testOwnedOptionalSetupNavigationAndStart'
    env={'NEST_QA_NAME':name,'NEST_QA_POSITIVE_BUDGET':'0','NEST_QA_API_ORIGIN':'https://nest-test-api-drrius-projects.vercel.app','NEST_QA_SUPABASE_ORIGIN':'https://tkjixmujjoustdiedfmw.supabase.co'}
    env['NEST_QA_SETUP_READ' if sdk else 'NEST_QA_SETUP_JOURNEY']='20261007-read-only-pair'
    case=OUT/(step+'-'+actor);assert not case.exists();case.mkdir(mode=0o700)
    plan[suite].setdefault('EnvironmentVariables',{}).update(env)
    selected=case/'selected.xctestrun';selected.write_bytes(plistlib.dumps(plan));selected.chmod(0o600)
    summary=None;restored=False;attempted=False
    awake=subprocess.Popen(['caffeinate','-dimsu','-t','1200'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        if step=='maximum':
            subprocess.run(['xcrun','simctl','ui',sim,'appearance','dark'],check=True)
            subprocess.run(['xcrun','simctl','ui',sim,'content_size','accessibility-extra-extra-extra-large'],check=True)
        (case/'invocation-consumed.json').write_text(json.dumps({'source':SOURCE,'testBuiltSource':'dad2f4be2032c4806bbc3ff1b203fbdc5eb8d0e2' if sdk else SOURCE,'actor':actor,'step':step,'method':method,'positiveBudget':0})+'\n')
        with (case/'test.log').open('w') as log:
            attempted=True
            result=subprocess.run(['xcodebuild','-xctestrun',str(selected),'-destination','platform=iOS Simulator,id='+sim,'-parallel-testing-enabled','NO','-resultBundlePath',str(case/'result.xcresult'),'-only-testing:'+suite+'/'+method,'test-without-building'],stdout=log,stderr=subprocess.STDOUT)
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
            (case/'terminal.json').write_text(json.dumps({'source':SOURCE,'testBuiltSource':'dad2f4be2032c4806bbc3ff1b203fbdc5eb8d0e2' if sdk else SOURCE,'attempted':attempted,'summaryRecorded':summary is not None,'restorationPassed':restored,'methodPassed':summary is not None and [summary[k] for k in ['passedTests','failedTests','skippedTests']]==[1,0,0],'explicitSaveCalls':0,'authorizedSaveBudget':0,'apiRequestsMeasured':sdk},indent=2)+'\n')

lock=open('/private/tmp/nest-food-controls-ui-actor.lock','a+')
fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
assert len(sys.argv)==3
run(sys.argv[1],sys.argv[2])
