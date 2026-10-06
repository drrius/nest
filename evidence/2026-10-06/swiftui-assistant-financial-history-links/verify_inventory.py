#!/usr/bin/env python3
"""Verify immutable recorded bill-result navigation evidence; never invoke API/UI."""
import hashlib, io, json, re, subprocess, tarfile
from pathlib import Path
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SDK = '6997138485f3f8088fc03682432de74879e19659'
VARIANTS = {
    'unused-8a-preparation': '8a63a9a90449955ae8872a858b3460c0869dbf86',
    'guarded-815-run': '8150e09506fb950ec6354ece1c75390a361e4a9a',
    '7f-targets': '7f079fad22e7f4ec8b82651a9d54611bdd7078b5',
}
ALEX = '791f7261-6c9d-4061-9c8a-57aa6e0b0200'
SAM = 'e5f80cfd-b69a-4aa0-a267-75784e943676'
HH = 'be772ffd-3ab5-41d5-8438-647a79a553da'
OP = 'f23e5dfb-cc10-4199-a0f1-bc2cfcbd521c'
REV = 'f736854d-935a-4433-ba0c-13a4b5e51ac6'
RUN = HERE / '7f-targets'


def read(path):
    return json.loads(path.read_text())


def digest(data):
    return hashlib.sha256(data).hexdigest()


def inventory():
    expected = read(HERE / 'sha256.json')
    files = {str(p.relative_to(HERE)) for p in HERE.rglob('*') if p.is_file() and p.name != 'sha256.json'}
    assert files == set(expected)
    tracked = set(subprocess.check_output(['git', 'ls-files'], cwd=ROOT, text=True).splitlines())
    assert {str((HERE / name).relative_to(ROOT)) for name in files | {'sha256.json'}} <= tracked
    for name, value in expected.items():
        path = HERE / name
        assert digest(path.read_bytes()) == value, name
        if path.suffix == '.png':
            continue
        text = path.read_text()
        assert not re.search(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.', text), name
        assert not re.search(r'Bearer\s+[A-Za-z0-9_.-]+', text, re.I), name
        assert not re.search(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----', text), name
    for manifest in HERE.rglob('manifest.json'):
        for test in read(manifest):
            for item in test['attachments']:
                assert (manifest.parent / item['exportedFileName']).is_file()
    return len(files) + 1


def verify_map(commit, path, count):
    values = read(path)
    assert len(values) == count
    raw = subprocess.check_output(['git', 'archive', commit, 'apps/ios'], cwd=ROOT)
    with tarfile.open(fileobj=io.BytesIO(raw)) as archive:
        for name, value in values.items():
            assert digest(archive.extractfile('apps/ios/' + name).read()) == value, name


def sources():
    prior = ROOT / 'evidence/2026-10-06/swiftui-native-recurring-reminder-save/recorded-save'
    for folder, commit in VARIANTS.items():
        run = HERE / folder
        verify_map(commit, run / 'source-input-hashes.json', 1124)
        verify_map(SDK, run / 'sdk-source-input-hashes.json', 1122)
        assert read(run / 'Nest-build-attestation.json') == read(prior / 'Nest-build-attestation.json')
        attested = read(run / 'NestAccessibility-build-attestation.json')
        assert attested['freshDirectoryRequired'] and len(attested['binarySha256']) >= 3
        assert 'AssistantFinancialHistoryLinkTests.swift' in str(attested['ownedSourceCompileLines'])
        assert attested['resolvedProductPaths']['NestAccessibilityTests']
        pin = read(run / 'source-pinning.json')
        assert pin['UIExecutedSource'] == commit and pin['SDKExecutedSource'] == SDK
        assert pin['UIInputs'] == 1124 and pin['SDKInputs'] == 1122
        assert read(run / 'prepared.json')['NoSDKOrUIExecuted']
    assert 'FinancialApprovalRow.swift' in str(read(RUN / 'NestAccessibility-build-attestation.json')['ownedSourceCompileLines'])
    assert not (HERE / 'unused-8a-preparation/results.json').exists()
    old = read(RUN / 'sdk-source-input-hashes.json')
    new = read(RUN / 'source-input-hashes.json')
    for name, value in old.items():
        if name.startswith(('Nest/Core/', 'Nest/Session/')):
            assert new[name] == value
    for name in ['baseline.json', 'references.json', 'captured-reminder-request.json']:
        assert read(RUN / name) == read(prior / name)
    for name, value in read(HERE / 'executed-controller-hashes.json').items():
        assert digest((HERE / 'controllers' / name).read_bytes()) == value


def request():
    saved = read(RUN / 'captured-reminder-request.json')
    command = saved['command']
    receipt = saved['result']['receipt']
    assert command['operationId'].lower() == OP and saved['result']['status'] == 'recorded'
    assert command['expectedRevision'] is None and command['expectedDueOn'] == '2026-11-01'
    assert not saved['cancellationRequested']
    settings = command['settings']
    assert settings['enabled'] and settings['localTime'] == '09:00' and settings['daysBefore'] == 1
    assert sorted(a.lower() for a in settings['recipientIds']) == sorted([ALEX, SAM])
    assert receipt['command'] == command and receipt['reminder']['settings'] == settings
    assert receipt['reminder']['revision'].lower() == REV
    return saved


def verify_read(row, saved, baseline, references):
    assert row['canonical'] == baseline and row['historyComplete'] and row['historyEventCount'] == 62
    assert row['hostedCommands'] == 0 and row['rule'] == references['ownedRule']
    assert row['household'].lower() == HH and row['actor'].lower() in [ALEX, SAM]
    assert row['reminder']['reminder'] == saved['result']['receipt']['reminder']
    owner = row['actor'].lower() == ALEX
    for result, expected in [(row['originalRuleRecovery'], references['originalRequest']['result']),
                             (row['reminderOperationRecovery'], saved['result'])]:
        if owner:
            assert result == expected
        else:
            assert result['status'] == 'unresolved' and result.get('receipt') is None
            assert result['actorId'].lower() == SAM and result['householdId'].lower() == HH
            assert result['operationId'].lower() == expected['operationId'].lower()


def reads():
    baseline = read(RUN / 'baseline.json')
    references = read(RUN / 'references.json')
    assert len(baseline['originalRules']) == 7
    assert sorted(r['status'] for r in baseline['originalRules']) == ['cancelled'] * 3 + ['paused'] * 4
    assert sum(len(p['rules']) for p in baseline['allRulePages']) == 8
    pages = baseline['historyPages']
    assert pages[-1].get('next') is None and sum(len(p['events']) for p in pages) == 62
    assert baseline['knownRemovedRenewalHistory'] == references['knownRemovedHistory']
    rows = list(HERE.glob('*/**/native-read.json'))
    assert len(rows) == 8
    saved = request()
    for path in rows:
        verify_read(read(path), saved, baseline, references)


def methods():
    fence = read(HERE / 'guarded-815-run/results.json')
    old = read(HERE / '815-ui-only/results.json')
    new = read(RUN / 'results.json')
    assert len(fence) == 2 and len(old) == 3 and len(new) == 5
    assert all([r['exitCode'], r['passed'], r['failed'], r['skipped']] == [0, 1, 0, 0] for r in fence + old[1:] + new)
    assert old[0]['failed'] == 1 and old[0]['passed'] == 0 and old[0]['exitCode'] != 0
    assert new[2]['method'] == old[0]['method'] == 'AssistantFinancialHistoryLinkTests/testExistingPrivateBillResultOpensItsRecordedExpense'
    assessment = read(HERE / 'guarded-815-run/retained-readonly-assessment.json')
    assert not assessment['UIInvoked'] and not assessment['causeAttributed']
    terminal = read(RUN / 'terminal.json')
    assert terminal['ResultNavigationMethodPassed'] and terminal['BothFinalReadsPassed']
    assert terminal['UIDomainMutationBudget'] == terminal['LiveModelInvocations'] == 0
    assert not terminal['WirePOSTCountMeasured'] and terminal['SDKAuthSetupMayPOSTLogin']


def targets():
    samples = []
    for path in (RUN / 'owner-normal-light').glob('*.json'):
        value = read(path)
        if isinstance(value, dict) and {'label', 'frame', 'hittable', 'viewport'}.issubset(value):
            samples.append(value)
    links = [v for v in samples if v['label'].startswith('Record recurring bill') or v['label'] == 'View recorded expense']
    assert len(links) == 2
    for value in links:
        assert value['exists'] and value['enabled'] and value['hittable']
        x, y, w, h = value['frame']
        vx, vy, vw, vh = value['viewport']
        assert w >= 44 - 1e-9 and h >= 44 - 1e-9
        assert x >= vx and y >= vy and x + w <= vx + vw and y + h <= vy + vh
    observed = read(HERE / 'rendered-review.json')
    assert observed['oldProposalHeight'] == 39 and observed['finalProposalHeight'] >= 44
    assert observed['recordedBillAndExpenseDirectlyReviewed'] and not observed['liveAIProof']


def restoration():
    value = read(RUN / 'restoration.json')
    assert value['before'] == value['after']
    assert all(value[k] for k in ['all64Empty', 'originalScopesUnchanged', 'initialUISettingsRestored',
                                 'foregroundLaunchAfterTests', 'ownedPlansRemoved', 'scopedCaffeinateStopped'])
    for phase in ['before-ui', 'after-ui']:
        settled = read(RUN / (phase + '-scope-settled.json'))
        assert settled['twoContiguousMatchingSamples'] and settled['originalActorsHousehold64']
    assert all(v == {'appearance': 'light', 'content_size': 'large'} for v in read(RUN / 'initial-ui-settings.json').values())
    reviews = read(HERE / 'visual-review.json')
    assert set(reviews) == {str(p.relative_to(HERE)) for p in HERE.rglob('*.png')}
    for name, review in reviews.items():
        assert review['reviewed'] and review['safeFictionalScope'] and review['sha256'] == digest((HERE / name).read_bytes())


if __name__ == '__main__':
    count = inventory()
    sources(); reads(); methods(); targets(); restoration()
    print(json.dumps({'passed': True, 'files': count, 'UIInputs': 1124, 'SDKInputs': 1122,
                      'nativePasses': 9, 'retainedNativeFailures': 1, 'retainedControllerScopeFailure': 1}))
