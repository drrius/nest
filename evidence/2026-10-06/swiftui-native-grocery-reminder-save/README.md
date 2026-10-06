# Native grocery reminder Save and disable

One existing fictional grocery now has a retained disabled reminder, configured through two deliberate native Saves. Alex first enabled both recipients for **2026-10-07 at 08:00 Europe/Zurich**, then disabled that same reminder with a second Save bound to its confirmed revision. Both requests were cleared through ordinary **Done**. The grocery stayed unchanged. The final reminder is **disabled and non-nil**; the initial nil-reminder state was not restored, and neither delivery nor worker execution is claimed.

The exact scope is household `be772ffd-3ab5-41d5-8438-647a79a553da`, existing unchecked **QA rice**, 100g, item `d24cc35d-a6ae-44c6-9780-e28f8723d44d`, item version `1`. Alex used owned simulator `C3ABC0D4-CFD4-4F23-8CC3-0E542014803A`; Sam used `CA0BCEDE-A297-493A-8921-9E31F8B65783` for read-only canonical checks. Real native authentication and membership verified the two original actors, household and exact two-person roster before actions. Stable test API/Supabase origins and push disabled were checked in both compiled bundles. Workers remain disabled under the authorized test configuration; no worker action or activation was requested, and worker runtime state was not separately queried.

| Actual native execution                                                | Result                                                                                                             |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Alex and Sam authenticated baseline reads                              | 2 PASS; no reminder, unchanged grocery, exact roster                                                               |
| Alex native enable Save                                                | PASS, 74.447s; one Save tap, real calendar October 7 selected and visible time/both recipients checked before Save |
| Both enabled canonical reads, plus Alex immutable operation GET        | 2 PASS                                                                                                             |
| Alex ordinary Done                                                     | PASS, 49.303s; exact local request cleared and confirmed reminder reloaded                                         |
| Alex native disable Save                                               | PASS, 57.113s; only enabled changed; prior revision, date, time and both recipients preserved                      |
| Both disabled canonical reads, plus Alex both immutable operation GETs | 2 PASS                                                                                                             |
| Alex second ordinary Done                                              | PASS, 50.736s; exact second request cleared and disabled reminder reloaded                                         |
| Both final canonical reads, plus Alex both immutable operation GETs    | 2 PASS                                                                                                             |

There are **12 actual passed methods, zero failures or skips**: four native UI methods and eight real SDK read methods. Exactly two distinct operations were recorded, with zero application replays. No shipping, model or server implementation was changed; only two new guarded acceptance sources were added.

| Command     | Operation ID                           | Confirmed reminder revision            |
| ----------- | -------------------------------------- | -------------------------------------- |
| Enable both | `e47d19d1-9c1b-47fd-bba3-a81af12114fc` | `3d473b6b-3a60-4857-8524-201b6241bb1d` |
| Disable     | `e1596aa1-1812-4396-840d-2e9282baec73` | `0238a099-9dd1-4ab7-8050-b4738dbf4b10` |

`enabled-saved-request.json` and `disabled-saved-request.json` preserve each exact actor/household-scoped local baseline, command, recorded recovery and receipt **before Done**. The controller read only the owned local request row and validated its item, actor, household, settings and receipt binding. It performed no direct journal mutation. The second command expected the first confirmed revision; its revision changed. Alex's normal operation GETs returned both original receipts unchanged even after disable and final Done. Sam read shared canonical detail only, because immutable receipt validation is bound to the command owner.

The native route was Today → Groceries → the unique QA rice menu → Reminder choices. The real compact calendar selected **Wednesday, October 7**; the date value and default native 08:00 time were verified before Save. Native switch-thumb and measured Form-gutter helpers came from the preceding audited navigation proof. Save methods were isolated from Done and had a durable two-command budget; no method loop retried Save. The source contains a read-only inspection guard for a possible interrupted reply, but it was not exercised because all boundaries passed.

Every receipt and canonical read refers to this owned fixture. Both members observed the same canonical reminder and unchanged full grocery payload. Final settings retain the October 7 date, 08:00 time and both recipient IDs with `enabled=false`. No reminder deletion, grocery completion, SQL server query, broad digest, financial command, model call, provider action, permission change or production operation was performed. Earlier nil-reminder baseline acceptance methods are historical proof and must not be rerun against this now configured fixture.

Actual logs, summaries, ordinary API read records, screenshots, accessibility trees, measured frames and the source hash inventory are exported separately. All 16 PNGs were visually inspected for fictional scope and the actual calendar, choices, recorded copy, Done reloads and restored Today. MP4 recordings, opaque snapshots and synthesized-event binaries remain private, with omitted attachments explicitly inventoried. Native signing/auth configuration, full xcresults and selected xctestrun files were not exported; selected plans were removed by normal cleanup. Original Keychains, app stores and signing/auth files were preserved.

Both original scopes returned to Today top, Me + shared selected, large text, light appearance and 64 empty intent journals through ordinary Done. Snapshot tables, including renewal read snapshots, are excluded from intent counts. Scoped caffeinate ended and the exclusive Mac lock was released. The two retained server receipts and disabled reminder history remain intact.

`verify_inventory.py` checks artifact hashes, tracked files, manifest references, reviewed screenshot hashes, unique operation/revision binding and canonical equality. Its default source reference is immutable acceptance-source commit `38f78e134458b13607ec364e26002f50c27daee4`; `--working-tree` additionally checks current native inputs against the executed source inventory. Complete exported JSON/Markdown formatting precedes checksums; native strict formatting and explicit 400-line, 80-code-line function and complexity-10 checks cover both added test files. Routine CI skips these dated hosted methods without their exact guards. This configuration proof does not establish physical-device behavior, reminder execution, push delivery or full M8 acceptance.

The original executed private controller is identified by SHA-256 in `controller-provenance.json`. The public rerunnable copy is an **unexecuted packaging variant** that splits one read-only assertion conjunction into the same ordered assertions to meet complexity 10. The two executed native test sources and their inputs are unchanged; no native action was rerun for this packaging refactor.

Both workflows pass at `a0a072c7`, whose native inputs are identical to acceptance
source `38f78e13`. Native CI records 502 Foundation cases with 41 explicit skips,
456 signed-app cases with 24 explicit skips, zero failures and four Swift Testing
cases. Formatting, source limits, signing and guarded UI compilation pass.
[CI metadata](ci.json) and [totals](ci-totals.txt) distinguish ordinary CI from
the 12 actual hosted native methods above.
