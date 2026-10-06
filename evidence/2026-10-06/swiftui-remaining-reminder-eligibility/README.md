# Existing native reminder eligibility

Two real authenticated native SDK methods passed: Test Alex (7.663s) and Test Sam (6.070s). Their complete recurring-rule and active-renewal pages, exact two-member roster and eligibility results are equal. Both lists reach `next=nil` in one page. The app uses the stable fictional test API/Supabase origins and push is disabled.

There is no eligible active editor fixture. The seven recurring rules comprise four paused and three cancelled rules; none is active. The active renewal list is empty. A next due date on an inactive rule does not enable reminder choices: the native model and screen require `status=active` and a nonnil next due date. The renewal list's validated contract excludes removed records. The previously owned removed renewal was not recreated or read as a candidate.

| Existing rule                          | Status    | Next due   |
| -------------------------------------- | --------- | ---------- |
| `06146b4a-95e5-4227-a562-5aebacceea6d` | paused    | 2026-10-11 |
| `10eaac3c-8445-49a9-b894-a18272ef3325` | paused    | 2026-11-04 |
| `3ec03a31-228f-4418-972e-fd7214e5482e` | cancelled | 2099-01-01 |
| `8102650a-db30-441e-b693-4f5b9561116f` | paused    | 2030-01-07 |
| `a25b5db8-2cc9-4ffc-9837-e1094695016b` | cancelled | 2099-01-01 |
| `bad4a3bb-d0ce-4799-a284-bdbcdb1f6dd0` | cancelled | 2026-10-28 |
| `db1568a6-24e4-48e5-ab6b-f0a8968068c1` | paused    | 2026-11-05 |

No target reminder context, financial balance or history was fetched because the eligibility condition found no candidate. The test's conditional financial branch is compiled but was not executed here. No UI method, activation, recreation, save, worker action or hosted command followed. Active recurring/renewal reminder draft-navigation coverage remains unavailable with these existing fixtures. A separate inactive-rule refusal check would establish a different behavior.

The SDK was rebuilt from immutable source `a7ac3ad7e33b4eedaa23e8c4c41362896d0c9683`, with all 1,105 native inputs matched before the build. The signed simulator app passed origin, push-disabled, build-19 and strict code-signature guards. This is actual SDK execution on the two owned SE3/iOS 26.3.1 simulators, not UI execution, physical-device proof or a release action. Routine CI skips the dated opt-in method.

The original actor/household scopes and 64 empty intent journals each are unchanged. No appearance, text-size, keychain, original app-store or shared signing/auth configuration change was made. Private selected plans were removed and scoped caffeinate terminated. Logs, summaries, canonical records and source hashes are exported without tokens or credentials; there are no screenshots to review. Protected build logs and xctestrun files remain private.

Run `python3 evidence/2026-10-06/swiftui-remaining-reminder-eligibility/verify_inventory.py` from the repository root. Its default uses the immutable source commit and verifies tracked hashes, actual result counts, terminal cursor completeness, canonical equality, no eligible targets and restored scopes.

Both CI workflows pass at `f176b2a9`: Nest37442918390 and SwiftUI37442918443. Native CI runs506 Foundation/41 skips,461 signed-app/29 skips and four Swift Testing cases, with zero failures. Strict source limits, formatting, signing and guarded UI compilation pass. The dated hosted preflight is skipped in CI; its two actual SDK passes above remain separate evidence.
