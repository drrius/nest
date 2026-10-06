# Gateway account context

Two authenticated read-only Vercel connector requests confirm that `nest-test-api`
belongs to `drrius-projects`. The response fields retained in [identity.json](identity.json)
contain no credentials, payment details or personal account exports.

The connector responses expose neither Gateway eligibility nor its credit balance.
They do not supersede the last actual provider403 `customer_verification_required`.
No inference, billing change, provider change or purchase occurred. The existing
project-only USD1 nonrefreshing test budget is not changed or newly verified here.

Current [Vercel budget documentation](https://vercel.com/docs/ai-gateway/observability-and-spend/budgets)
distinguishes spend limits from available credits or payment eligibility. A budget
alone does not establish that requests can run. The owner still needs to finish any
verification prompt for this team and report eligibility changed before a bounded
provider retry. No additional purchase or automatic top-up is requested.

The pinned Gateway4.0.86 source implements `getCredits()` as GET `/v1/credits`.
Both existing ignored local OIDC credentials match the expected team/project,
but expired27 September. Only expiration and identity-match booleans were inspected;
no token is exported and no authenticated credit request is sent. Local expiry
does not establish the state of deployed automatically refreshed OIDC or explain
its earlier verification403. A fresh authorized credential would be needed for
that read, and successful balance metadata would still not prove live generation.
