from pathlib import Path
import re,shutil,hashlib,json,sys
root=Path(sys.argv[1]).resolve()
assert root.parent in [Path('/tmp'),Path('/private/tmp')] and root.name.startswith('nest-contrast-sdk-')
root.mkdir(exist_ok=False)
source=Path(__file__).resolve().parents[3]
evidence=source/'evidence/2026-10-07/swiftui-native-contrast-probe'
project=(source/'apps/ios/Nest.xcodeproj/project.pbxproj').read_text()
project=re.sub(r'^\t\tA300[^\n]*= \{\n.*?^\t\t\};\n','',project,flags=re.M|re.S)
project=re.sub(r'A300[0-9A-F]{20} = \{[^}]*\}; ?', '',project)
project=re.sub(r'files = \(A200[^;]*\);', 'files = ();',project)
project=re.sub(r'package(?:ProductDependencies|References) = \([^;]*\);',lambda m:m.group(0).split('=')[0]+'= ();',project)
project='\n'.join(line for line in project.splitlines() if not line.lstrip().startswith(('A300','A200')))+'\n'
project=re.sub(r'A300[0-9A-F]{20} /\*[^*]*\*/,? ?', '',project)
project=project.replace('Nest','ContrastProbe').replace('ch.drrius.nest','ch.drrius.nest.contrastprobe')
for key in ['ASSETCATALOG_COMPILER_APPICON_NAME','ASSETCATALOG_COMPILER_GENERATE_SWIFT_ASSET_SYMBOL_EXTENSIONS','CODE_SIGN_ENTITLEMENTS','OTHER_LDFLAGS','DEVELOPMENT_TEAM','PROVISIONING_PROFILE_SPECIFIER','NEST_PUSH_ENABLED','NEST_APNS_ENVIRONMENT']:
 project=re.sub(r'\b'+key+r' = [^;]*; ?', '',project)
assert 'A200' not in project and 'A300' not in project
assert 'supabase' not in project.lower() and '-lsqlite3' not in project
(root/'ContrastProbe.xcodeproj/xcshareddata/xcschemes').mkdir(parents=True)
(root/'ContrastProbe.xcodeproj/project.pbxproj').write_text(project)
scheme=(source/'apps/ios/Nest.xcodeproj/xcshareddata/xcschemes/NestAccessibility.xcscheme').read_text().replace('Nest','ContrastProbe')
(root/'ContrastProbe.xcodeproj/xcshareddata/xcschemes/ContrastProbeAccessibility.xcscheme').write_text(scheme)
for path,src in [('ContrastProbe/Probe.swift','Probe.swift'),('UITests/ProbeTests.swift','ProbeTests.swift')]:
 dest=root/path;dest.parent.mkdir(exist_ok=True)
 shutil.copyfile(evidence/src,dest)
(root/'Info.plist').write_text('''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
<key>CFBundleExecutable</key><string>$(EXECUTABLE_NAME)</string>
<key>CFBundleName</key><string>ContrastProbe</string>
<key>CFBundleVersion</key><string>1</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>LSRequiresIPhoneOS</key><true/>
<key>UILaunchScreen</key><dict/>
</dict></plist>''')
(root/'input-hashes.json').write_text(json.dumps({str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in root.rglob('*') if p.is_file()},indent=2)+'\n')
print('Prepared standalone source and audited target metadata, no domain sources/packages.')
