from pathlib import Path
import json
root=Path(__file__).resolve().parent
counts={}
for phase in ['native/normal-alex','native/normal-sam','keyboard-pan-failure/maximum-alex','title-direction-failure/maximum-alex']:
 summary=json.loads((root/phase/'summary.json').read_text())
 actor=phase.rsplit('-',1)[1]
 counts.setdefault(actor,{'passed':0,'failed':0,'skipped':0})
 for key in counts[actor]:counts[actor][key]+=summary[key+'Tests']
print(json.dumps({'premise':'The recorded-history reader can navigate this expense Form without accounting for keyboard state or search direction.','counts':counts,'assignment':'Alex is the first largest-text actor tested; Sam largest-text is not yet executed.','failures':['Keyboard action regions leave no safe left-side pan margin.','The preserved description is unrealized above the review actions; the default missing-target search moves forward.'],'shippingCodeChangedBetweenFailures':False},indent=2))
