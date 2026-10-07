from pathlib import Path
import json

ROOT = Path(__file__).resolve().parent
cases = json.loads((ROOT/'observations.json').read_text())
extra = ROOT/'no-fade/observations.json'
if extra.exists(): cases += json.loads(extra.read_text())
rows = []
for case in cases:
    positions = case['positions']
    bar = positions['tabBarFrame']
    strict = [issue for issue in case['issues'] if issue['summary'] == 'Contrast failed']
    near = [issue for issue in case['issues'] if issue['summary'] == 'Contrast nearly passed']
    rows.append({
        'test': case['test'],
        'withoutTabs': positions['withoutTabs'],
        'hideEdge': positions.get('hideEdge', False),
        'strictFailureCount': len(strict),
        'nearlyPassedCount': len(near),
        'belowBarStrictLabels': [issue['label'] for issue in strict if bar[3] > 0 and issue['frame'][1] >= bar[1]],
        'otherStrictLabels': [issue['label'] for issue in strict if bar[3] == 0 or issue['frame'][1] < bar[1]],
    })
result = {
    'cases': rows,
    'paragraphCoordinatesIdentical': all(case['positions']['paragraphs'] == cases[0]['positions']['paragraphs'] for case in cases),
    'suppressedIssues': 0,
    'nestAuditPassClaimed': False,
    'hardwareVerified': False,
}
(ROOT/'comparison.json').write_text(json.dumps(result, indent=2)+'\n')
print(json.dumps(result, indent=2))
