"""Reproduce the retained control-target census without new native execution."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
corner = ROOT / 'corner-observer-failure/normal_light'
switch_rows = []
for path in corner.glob('*.txt'):
    for line in path.read_text().splitlines():
        if 'Switch,' in line and ('Reminder enabled' in line or 'Remind me' in line):
            switch_rows.append(line.strip())
report = {
    'premise': 'An accessibility rectangle is wholly tappable and its center always activates the visible control.',
    'actor': 'Test Alex, the only authorized UI actor in these diagnostics',
    'nativeRoles': [
        {'control': 'Round Back toolbar chrome', 'result': 'Extreme rectangular corner missed; visible left edge dismissed.'},
        {'control': 'Switch accessibility row', 'result': 'Row center did not activate the right-hand native thumb.'},
    ],
    'measuredSwitchRows': sorted(set(switch_rows)),
    'shippingChangeNeededForObservedHitGeometry': False,
    'nextObserver': 'Use visible native control coordinates and verify effect immediately.',
    'newNativeExecutions': 0,
}
(ROOT / 'control-premise-census.json').write_text(json.dumps(report, indent=2) + '\n')
print('Retained geometry census generated; no native or network actions')
