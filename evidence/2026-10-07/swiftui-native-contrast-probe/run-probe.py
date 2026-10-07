from pathlib import Path
import fcntl, hashlib, json, subprocess, sys

ROOT = Path(sys.argv[1]).resolve()
assert ROOT.parent == Path('/private/tmp') and ROOT.name.startswith('nest-contrast-sdk-')
ONLY = sys.argv[2] if len(sys.argv) == 3 else None
assert ONLY is None or ONLY == 'testNativeTabsWithoutEdgeFade'
ORIGINALS = ['C3ABC0D4-CFD4-4F23-8CC3-0E542014803A', 'CA0BCEDE-A297-493A-8921-9E31F8B65783']


def run(args):
    return subprocess.run(args, check=True, capture_output=True, text=True)


def original_state():
    namespace = {}
    source = Path('/private/tmp/nest-native-saved-portion-readback-prepare-20261007.py').read_text()
    exec(source.split('lock=open(', 1)[0], namespace)
    state = {
        'scopes': namespace['scopes'](),
        'display': namespace['ui_settings'](),
        'choices': namespace['original_view_state'](),
        'applicationPaths': [run(['xcrun', 'simctl', 'get_app_container', sim, 'ch.drrius.nest', 'app']).stdout.strip() for sim in ORIGINALS],
    }
    return hashlib.sha256(json.dumps(state, sort_keys=True).encode()).hexdigest()


lock = open('/private/tmp/nest-food-controls-ui-actor.lock', 'a+')
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
before = original_state()
assert ROOT.is_dir() and not (ROOT/'probe-results.xcresult').exists()
run(['xcrun', 'swift-format', 'format', '--in-place', str(ROOT/'ContrastProbe/Probe.swift'), str(ROOT/'UITests/ProbeTests.swift')])
run(['xcrun', 'swift-format', 'lint', '--strict', str(ROOT/'ContrastProbe/Probe.swift'), str(ROOT/'UITests/ProbeTests.swift')])
(ROOT/'actual-input-hashes.json').write_text(json.dumps({str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in ROOT.rglob('*') if p.is_file() and p.suffix in ['.swift', '.pbxproj', '.plist', '.xcscheme']}, indent=2)+'\n')
sim = run(['xcrun', 'simctl', 'create', 'Nest SDK contrast probe 20261007', 'com.apple.CoreSimulator.SimDeviceType.iPhone-SE-3rd-generation', 'com.apple.CoreSimulator.SimRuntime.iOS-26-3']).stdout.strip()
(ROOT/'owned-simulator.txt').write_text(sim+'\n')
print(json.dumps({'phase': 'created-isolated-simulator', 'simulator': sim, 'originalStateSha256': before}), flush=True)
try:
    run(['xcrun', 'simctl', 'boot', sim])
    run(['xcrun', 'simctl', 'bootstatus', sim, '-b'])
    run(['xcrun', 'simctl', 'ui', sim, 'appearance', 'light'])
    run(['xcrun', 'simctl', 'ui', sim, 'content_size', 'large'])
    with (ROOT/'build-test.log').open('w') as log:
        command = ['xcodebuild', '-project', str(ROOT/'ContrastProbe.xcodeproj'), '-scheme', 'ContrastProbeAccessibility', '-configuration', 'Debug', '-destination', 'platform=iOS Simulator,id='+sim, '-derivedDataPath', str(ROOT/'build'), '-resultBundlePath', str(ROOT/'probe-results.xcresult'), '-parallel-testing-enabled', 'NO', 'CODE_SIGNING_ALLOWED=YES', 'CODE_SIGN_IDENTITY=-', 'test']
        if ONLY: command.append('-only-testing:ContrastProbeAccessibilityTests/NativeContrastProbeTests/'+ONLY)
        result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT)
    (ROOT/'execution.json').write_text(json.dumps({'exitCode': result.returncode, 'ownedSimulator': sim, 'originals': 'untouched', 'auditSuppressions': 0, 'networkCode': False})+'\n')
    print(json.dumps({'phase': 'audits-terminal', 'exitCode': result.returncode}), flush=True)
finally:
    run(['xcrun', 'simctl', 'shutdown', sim])
    run(['xcrun', 'simctl', 'delete', sim])
    after = original_state()
    proof = {'ownedSimulatorDeleted': True, 'originalStateBefore': before, 'originalStateAfter': after, 'originalStateMatches': before == after}
    (ROOT/'cleanup.json').write_text(json.dumps(proof, indent=2)+'\n')
    assert before == after, 'Original scopes/journals/application paths/display/private choices changed; no repair attempted'
    print(json.dumps({'phase': 'cleanup', **proof}), flush=True)
