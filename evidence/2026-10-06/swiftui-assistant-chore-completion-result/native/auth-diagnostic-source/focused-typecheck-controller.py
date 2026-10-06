from pathlib import Path
import hashlib,json,subprocess
source=Path('/private/tmp/nest-chore-history-auth-diagnostic-review-20261006.swift')
products=Path('/private/tmp/nest-active-bill-reminder-save-validated-sdk-20261006/Build/Products/Debug-iphonesimulator')
assert (products/'Nest.swiftmodule').exists() and (products/'Auth.swiftmodule').exists()
sdk=subprocess.check_output(['xcrun','--sdk','iphonesimulator','--show-sdk-path'],text=True).strip()
platform=Path('/Applications/Xcode.app/Contents/Developer/Platforms/iPhoneSimulator.platform/Developer')
args=['xcrun','--sdk','iphonesimulator','swiftc','-swift-version','6','-typecheck','-target','arm64-apple-ios18.0-simulator','-sdk',sdk,'-F',str(platform/'Library/Frameworks'),'-I',str(platform/'usr/lib'),'-I',str(products),'-F',str(products/'PackageFrameworks'),'-module-cache-path','/private/tmp/nest-chore-auth-diagnostic-typecheck-cache-20261006','-module-name','NestChoreAuthDiagnosticTypecheck',str(source)]
log=Path('/private/tmp/nest-chore-auth-diagnostic-typecheck-20261006.txt')
with log.open('w') as stream:result=subprocess.run(args,stdout=stream,stderr=subprocess.STDOUT)
record={'actualSwift6iOS18TypecheckPassed':result.returncode==0,'exitCode':result.returncode,'sourceSHA256':hashlib.sha256(source.read_bytes()).hexdigest(),'target':'arm64-apple-ios18.0-simulator','platformXCTestOverlayIncluded':True,'compiledNestModuleSource':'6997138485f3f8088fc03682432de74879e19659','compilerArguments':args,'logSHA256':hashlib.sha256(log.read_bytes()).hexdigest(),'appBuildDiagnosticAPIUIFixtureExecuted':False}
Path('/private/tmp/nest-chore-auth-diagnostic-typecheck-attestation-20261006.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps(record),flush=True)
if result.returncode:print(log.read_text());raise SystemExit(result.returncode)
