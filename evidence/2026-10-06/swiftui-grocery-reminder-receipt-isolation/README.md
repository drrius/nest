# Native grocery reminder receipt isolation

Two real native SDK methods verified GET-only isolation for the existing owned reminder operations. Alex received both original immutable recorded receipts. Sam queried those same operation IDs and received `unresolved` with no receipt, his own actor ID and the exact fictional household. Both members could still read the shared canonical disabled reminder and unchanged version-1 grocery.

| Actual signed native method | Result                                                                                          |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| Alex, owned SE3 simulator   | PASS, 6.808s; both owner receipts exactly match the original saved requests                     |
| Sam, owned SE3 simulator    | PASS, 4.805s; both operation results unresolved, receipt nil, actor Sam and household validated |

Exactly **2 methods passed, 0 failed, 0 skipped**, with one invocation per actor and no rerun. The two existing operations are `e47d19d1-9c1b-47fd-bba3-a81af12114fc` and `e1596aa1-1812-4396-840d-2e9282baec73`. The grocery is existing QA rice, 100g, item `d24cc35d-a6ae-44c6-9780-e28f8723d44d` in household `be772ffd-3ab5-41d5-8438-647a79a553da`. The retained disabled reminder matches the original disable receipt, revision `0238a099-9dd1-4ab7-8050-b4738dbf4b10`; date, time, both recipients and full grocery payload remain unchanged.

The new dated opt-in AppTest uses ordinary native authentication and member verification for only the two original fictional sessions. Its test-only domain transport rejects every method except GET and every host except the stable Nest test API. It calls `recoverGroceryReminder(cancel:false)` and canonical detail through the shipping typed client. It makes no Save, cancel, POST, fixture creation, SQL server query, model call or worker request. Normal existing native authentication is preserved; auth tokens and signing/configuration are not exported.

The SDK/app target was built once with the new source, strict test origins and push disabled. Both methods ran once on the original owned simulators under the exclusive Mac lock. Before and after states match, including original actor/household scopes and 64 empty intent journals each. No UI automation, appearance change, content-size change, permission change or screenshot capture occurred. The ephemeral read store and owned selected plans were cleaned normally, and scoped caffeinate ended.

`fixture-inputs.json` contains only the two existing owned saved requests from the preceding real Save proof. `alex/native-read.json` and `sam/native-read.json` contain sanitized actual canonical and operation results. Logs, summaries, restoration, source inventory and the exact read-only controller are separate artifacts. Opaque native attachments remain private and are listed explicitly if present. No full result bundle, xctestrun, Keychain or auth configuration is exported.

Anonymous and wrong-household checks were not added to this native slice. NestHTTP rejects an empty token before transport, and this slice uses only the two authenticated owned household sessions. The parent's separate disposable HTTP/database privacy tests are separate verification and are not counted among these two native passes. Live server operation-row counts were not queried; no new-row claim is inferred from an unresolved result alone.

Both workflows pass at `a5ce9ec7`, with native source identical to `f57094f3`.
CI records 502 Foundation cases with 41 skips, 457 signed-app cases with 25 skips,
four Swift Testing cases and zero failures. Strict formatting, limits, signing
and guarded UI compilation pass. [Metadata](ci.json), [totals](ci-totals.txt).
These CI checks compile and skip the dated hosted method; the two actual native
passes above establish its observed behavior.

Complete JSON/Markdown formatting precedes artifact hashes. The inventory verifier checks tracked artifacts, source against immutable commit `f57094f3d3bee1d1aa945fe2fbb59398c42c19e4`, owner/partner semantics and canonical equality. `--working-tree` optionally checks current native inputs. Explicit native limits cover the AppTest's function sizes and complexity as well as the global Swift check. Routine CI skips the hosted method unless its exact dated guards are supplied. This receipt-read proof does not establish delivery, physical-device behavior or full M8 acceptance.
