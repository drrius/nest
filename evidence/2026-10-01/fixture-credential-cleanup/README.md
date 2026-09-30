# Fictional fixture credential cleanup

A diagnostic in this task accidentally printed private credentials for three fictional example.invalid test accounts. Only those three allowlisted account passwords were replaced, and all their old refresh sessions were revoked. Old password and old refresh attempts are rejected; fresh logins succeed. No credential values are retained here.

Readonly before/after database hashes match for all 13 financial events, allocation and ledger rows, and the full rows of every nonfixture Auth account. The test project is `tkjixmujjoustdiedfmw`; production was untouched. No owner account, membership, email, server key or production credential changed.

The owned SE simulator's SDK session was restored using the existing exact-identity harness: one actual hosted native test passed, with zero failures/skips. The original Xcode scheme was restored and its credential sidecar removed. Ordinary app reinstall/Today navigation and push-disabled signing pass. Seven scoped meal/privacy journals remain empty; the selected meal week, Calendar consent and bounded financial projection are unchanged. This does not establish physical Apple Sign In or global access-token invalidation before token expiry.
