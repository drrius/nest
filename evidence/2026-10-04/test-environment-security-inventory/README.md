# Test-environment security and scheduler inventory

Observed4 October2026 against **nest-test**, project `tkjixmujjoustdiedfmw`. This is a read-only hosted inventory, not production inspection or full security acceptance. No database/configuration changes, scheduler activation, model requests or server-secret transfers occurred.

## Observed boundaries

- The project is ACTIVE_HEALTHY in `eu-central-2`, PostgreSQL17.6.1.166. Every public table has RLS; there are no public views and no anonymously executable security-definer functions in schemas accessible to `anon`.
- All61 RLS-enabled tables with no policies have no anonymous/authenticated SELECT grants or authenticated write grants. These are58 private tables and three public internal-job tables. Their deny-all boundary is intentional; granting broad policies merely to remove an informational warning would weaken it.
- Ten private internal tables do not have RLS. Neither client role has table privileges. Authenticated has private-schema USAGE, but the live REST API rejects `Accept-Profile: private` with406/PGRST106 and explicitly lists only `public, graphql_public` as exposed. This confirms the current private-schema boundary; RLS defense in depth and privileged-function semantics still need review.
- The35 worker RPC names extracted from the actual push/recurring adapters resolve to70 public/private definitions. Every definition denies anonymous/authenticated EXECUTE and allows `service_role`. The live `cron.job` inventory is empty. Neither metadata nor grants establish that a worker executes or that APNs delivers.
- Hosted migration history has55 platform entries, including the batched baseline. This count does not prove that all302 local migration files match the hosted definitions. One Edge function, `nest-receipt-upload`, is ACTIVE/version1 with JWT verification enabled; this metadata does not prove upload/storage behavior or external-writer drainage.

## Authentication and outstanding warnings

The public Auth settings endpoint returns200: Apple and email providers are enabled, anonymous users/phone/SAML are disabled, signup is enabled (`disable_signup:false`) and email autoconfirm is disabled. The identity histogram has one Apple and three email identities; no user identifiers or addresses are exported. Signup does not itself grant household membership. Public signup and the fixture email provider still need a deliberate test/release decision alongside partner Apple linking; no provider was changed during this audit.

Security advisors report three groups:

| Advisor                                                                                                                                                            | Observation                                                                   | Remaining action                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| [RLS enabled, no policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)                                                | INFO,61 tables; deny-all RLS plus the catalog privilege checks above          | Preserve the intended internal boundary; review any later grant changes                                                                    |
| [Authenticated security-definer execution](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) | WARN,81 public functions:21 Nest and60 legacy; all have a fixed search path   | Trace each callable function and its delegated authorization before accepting or changing it. A keyword/hash check is not a semantic audit |
| [Leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)                             | WARN, protection not enabled; current Supabase documentation lists it as Pro+ | Record the free-test limitation; no subscription purchase or upgrade is authorized                                                         |

There are also140 authenticated-executable private security-definer functions. Unexposed schemas do not excuse authorization inside helpers reached from public wrappers. Full helper/public/legacy semantic review remains incomplete.

## Evidence and limitations

[Report](report.json) retains sanitized advisor/catalog/migration/function metadata. [Catalog queries](catalog-queries.sql) contain only SELECT metadata reads. [Public configuration](public-config.json) records the allowlisted Auth response and actual private-schema rejection. The REST OpenAPI root initially returned401 “Secret API key required”; that result was not treated as schema proof. The subsequent zero-row table request provided the406 evidence without a secret key or user session.

[Supabase custom-schema documentation](https://supabase.com/docs/guides/api/using-custom-schemas) describes schema exposure separately from grants. [Auth endpoint documentation](https://github.com/supabase/auth/blob/master/README.md) documents the public settings endpoint. The changelog markdown fetch returned unsupported content type; no implementation or schema change was based on an unverified changelog.

Production configuration, live external schedules/requests, privileged-function semantic safety, complete Auth/Storage execution, worker delivery, APNs and full M9 acceptance remain unverified. No warning was dismissed solely to clear a release gate.
