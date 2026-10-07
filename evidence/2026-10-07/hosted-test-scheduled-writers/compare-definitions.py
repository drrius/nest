from pathlib import Path
import json

ROOT = Path(__file__).resolve().parent
source = json.loads((ROOT/'local-compiled.json').read_text())
hosted = json.loads((ROOT/'observation.json').read_text())
assert source['diagnosticComplete'], 'Incomplete source compilation'


def qualified(signature):
    return signature if signature.startswith(('public.', 'private.')) else 'public.'+signature


expected = {qualified(row['signature']): row for row in source['catalog']['auditedFunctionDefinitions']}
actual = {qualified(row['signature']): row for row in hosted['observation']['auditedFunctionDefinitions']}
assert set(expected) == set(actual) and len(expected) == 8, 'Known definition set differs'
rows = [{
    'signature': signature,
    'definitionSha256Matches': expected[signature]['definitionSha256'] == actual[signature]['definitionSha256'],
    'securityDefinerMatches': expected[signature]['securityDefiner'] == actual[signature]['securityDefiner'],
    'localOwner': expected[signature]['owner'],
    'hostedOwner': actual[signature]['owner'],
    'ownerMatches': expected[signature]['owner'] == actual[signature]['owner'],
} for signature in sorted(expected)]
result = {
    'allEightDefinitionHashesMatch': all(row['definitionSha256Matches'] for row in rows),
    'allDefinerFlagsMatch': all(row['securityDefinerMatches'] for row in rows),
    'ownerIdentityEquivalent': all(row['ownerMatches'] for row in rows),
    'ownerCapabilitiesVerified': False,
    'privateDependenciesSemanticsVerified': False,
    'rows': rows,
}
(ROOT/'definition-comparison.json').write_text(json.dumps(result, indent=2)+'\n')
assert result['allEightDefinitionHashesMatch'] and result['allDefinerFlagsMatch'], 'Definition source parity failed'
print('Eight definition hashes and definer flags match; owner differences are retained.')
