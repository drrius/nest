from pathlib import Path
import fcntl,json,os,subprocess
os.umask(0o077)
OUT=Path('/private/tmp/nest-renewal-offline-repro-after-fixture-fix-20261006');assert not OUT.exists();OUT.mkdir(mode=0o700)
lock=open('/private/tmp/nest-food-controls-ui-actor.lock','a+');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
awake=subprocess.Popen(['caffeinate','-dimsu','-t','1200'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
    args=['xcodebuild','-project','/private/tmp/nest-current-qa-82a/apps/ios/Nest.xcodeproj','-scheme','Nest','-configuration','Debug','-destination','platform=iOS Simulator,id=C3ABC0D4-CFD4-4F23-8CC3-0E542014803A','-derivedDataPath','/private/tmp/nest-swiftui-partner-sdk-20261005','-clonedSourcePackagesDirPath','/private/tmp/nest-swiftui-accessibility-20261005/SourcePackages','-xcconfig','/private/tmp/nest-swiftui-test.xcconfig','-parallel-testing-enabled','NO','CODE_SIGNING_ALLOWED=YES','CODE_SIGN_IDENTITY=-','-resultBundlePath',str(OUT/'result.xcresult'),'-only-testing:NestAppTests/RenewalsModelTests/testPreviouslyLoadedRenewalsRemainReadableAfterOfflineRestart','-only-testing:NestAppTests/RenewalsModelTests/testUnavailableRefreshRetainsPreviouslyLoadedRows','test']
    with (OUT/'native-test.log').open('w') as log:result=subprocess.run(args,stdout=log,stderr=subprocess.STDOUT)
    summary=json.loads(subprocess.check_output(['xcrun','xcresulttool','get','test-results','summary','--path',str(OUT/'result.xcresult')],text=True))
    (OUT/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
    print(json.dumps({'exit':result.returncode,'passed':summary['passedTests'],'failed':summary['failedTests']}),flush=True)
finally:awake.terminate();awake.wait()
