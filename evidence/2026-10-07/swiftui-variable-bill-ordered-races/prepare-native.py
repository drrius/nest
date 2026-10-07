from pathlib import Path
import fcntl,hashlib,json,plistlib,subprocess,tarfile
root=Path('/private/tmp/nest-native-variable-races-20261007');root.mkdir(exist_ok=False)
lock=open('/private/tmp/nest-food-controls-ui-actor.lock','a+');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
source=root/'source';source.mkdir()
with tarfile.open('/private/tmp/nest-variable-race-source-20261007.tar') as tar:
 for member in tar.getmembers():
  assert member.isfile() and not Path(member.name).is_absolute() and '..' not in Path(member.name).parts
 tar.extractall(source)
expected=json.loads(Path('/private/tmp/nest-variable-race-native-inputs-20261007.json').read_text())
assert all(hashlib.sha256((source/name).read_bytes()).hexdigest()==value for name,value in expected.items())
fmt=['xcrun','swift-format','format','--in-place','--configuration',str(source/'apps/ios/.swift-format')]
files=[source/'apps/ios/AppTests'/name for name in ['VariableCycleContentionTests.swift','NativeVariableRaceFixture.swift']]
subprocess.run(fmt+list(map(str,files)),check=True)
p=source/'apps/ios/Info.plist';info=plistlib.loads(p.read_bytes())
info['NSAppTransportSecurity']={'NSAllowsLocalNetworking':True,'NSExceptionDomains':{'localhost':{'NSExceptionAllowsInsecureHTTPLoads':True,'NSIncludesSubdomains':False}}}
p.write_bytes(plistlib.dumps(info))
(root/'prepared-source.json').write_text(json.dumps({'sourceFiles':len(expected),'testOnlyHTTPException':'localhost','originalSourceHashesMatched':True,'shippingSourceChanged':False})+'\n')
with (root/'build.log').open('w') as log:
 result=subprocess.run(['xcodebuild','-project',str(source/'apps/ios/Nest.xcodeproj'),'-scheme','Nest','-configuration','Debug','-destination','generic/platform=iOS Simulator','-derivedDataPath',str(root/'build'),'-clonedSourcePackagesDirPath','/private/tmp/nest-swiftui-accessibility-20261005/SourcePackages','-parallel-testing-enabled','NO','CODE_SIGNING_ALLOWED=YES','CODE_SIGN_IDENTITY=-','build-for-testing'],stdout=log,stderr=subprocess.STDOUT)
print(json.dumps({'buildExit':result.returncode,'ownedRoot':str(root)}),flush=True)
assert result.returncode==0
