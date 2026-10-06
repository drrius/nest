# Active renewal reminder fixture: phase 1

Alex created **Nest QA reminder 0610-3f88** once through the real SwiftUI form. Both fictional members read the same canonical renewal, and Alex recovered the original immutable receipt through a GET. Normal Done cleared the exact local request. The fixture remains active with no reminder for a separately authorized next phase.

- Renewal: `23435fe5-5b08-48cd-b0fb-03f0e2d49690`.
- Creation operation: `bf8ff1ab-f27c-4481-9769-a41a9c96f652`.
- Revision: `6610131c-d4d9-42fc-89f2-42ffe0a7b777`.
- Fields: renewal and cancellation dates `2026-10-07`, notice `0`, responsible member and recurring rule both null.
- Deliberate commands: one Create, zero reminder Saves, zero Removes, zero Create replays.

## Actual execution and retained failures

| Batch                   | Immutable source              | Actual result                                                                                                                                                                                                        |
| ----------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| compile-failure         | `3dfcd521`                    | SDK compilation failed on a non-Sendable XCTestCase capture; no Auth, API, UI method or Create execution. Matching native CI failure retained.                                                                       |
| nil-json-failure        | `1a143ddb`                    | Alex SDK method failed encoding an optional nil JSON fragment, 24.853 s. Nine instrumented GET responses were 200; no complete canonical attachment, Sam method, UI or Create.                                       |
| alex-cold-launch        | `e1a6b2d9`                    | UI-only ordinary shipping launch passed, 14.203 s. Separate controller assertion failed because the data-container UUID moved.                                                                                       |
| sam-cold-launch         | `9e752368`                    | UI-only ordinary shipping launch passed, 13.798 s. Durable database checks allowed container relocation.                                                                                                             |
| picker-observer-failure | `9e752368`                    | Both complete SDK baselines passed; Create UI method failed before Save, 128.209 s, looking for bare picker labels instead of the captured compound labels. No owned request existed.                                |
| created                 | `68b7632d`                    | Fresh paired baselines, one Create, and both created-record reads passed. Done method failed, 59.724 s, waiting for an off-screen, virtualized Refresh button before reaching Done. Exact recorded request retained. |
| done-recovery           | UI `cc81310a`, SDK `68b7632d` | Done-only UI passed, 31.084 s, then both final canonical/detail reads and Alex immutable recovery passed. Create was not rerun.                                                                                      |

Aggregate: **12 native method passes and 3 retained native method failures**. The compile failure and post-UI container assertion are separate failures, not XCTest method results. No batch is relabeled after correction.

Each frozen map contains all 1,110 native inputs. The Done recovery rebuilt the UI target and reused the SDK binary compiled at `68b7632d`: every mapped path except `UITests/NativeActiveRenewalReminderTests.swift` is identical. Its fresh SDK GETs are recorded separately. No shipping source was changed in this phase. Build-number guards required 19; this is simulator execution, not a phone or distribution claim.

## Canonical preservation

The real GET-only readers authenticate the original Test Alex and Test Sam accounts in household `be772ffd-3ab5-41d5-8438-647a79a553da`, with fixed test origins and push disabled. Before Create, active renewal pagination reached its terminal cursor and the fresh exact title was absent. Retained historical title absence was not verified.

Both readers compare the complete captured canonical object before and after Create and after Done: exact roster, all seven recurring rules, groceries, the old removed renewal `17919246-d8ec-4402-b301-da1149d1cc35`, balances, and all 62 financial event summaries across terminal pagination. Alex remains +1 centime and Sam −1 centime. The new active row is the only active renewal, has no recurring link, and its household/item-bound reminder envelope contains no reminder. The financial baseline is preserved; it is not reset to zero.

`created/owned-created-request.json` preserves the exact scoped command and recorded receipt before Done. Both created readers and both final readers assert the same revision and complete fields. Alex's GET-only owner recovery returns that original recorded result even after Done. Sam reads the shared canonical item without requesting Alex's operation receipt. No server SQL, broad unrelated-table hashes, delivery, worker activation, APNs or permission action was performed.

## Scope interruption and ordinary recovery

The nil-JSON failure also ended with Alex's local scope unset. A bounded read of retained PID 48407 logs shows two provider responses of 200 and two `/v1/session` responses, 401 and 200. The instrumented SDK recorded only 200 responses; the 401 belongs to a separate non-SDK request. Its exact caller and cause remain unknown. This is not proof of a natural-refresh fix or a diagnosed two-client race.

The authorized Alex and Sam UI-only ordinary cold launches verified their original profiles and Today. No SDK Auth diagnostic, sign-in, credential editing, TTL manipulation or manual SQLite repair accompanied those launches. Alex obtained a legitimate lease through shipping restore. Its container UUID changed while database basename/device/inode and all 11 snapshot counts stayed equal; Sam's ordinary launch similarly preserved its durable database. This supports retained storage through relocation, not byte identity. The original strict container assertion failure is retained.

After the real creation, the failed Done observer left Alex with exactly one recorded renewal journal and 63 empty journals, Sam with 64. Recovery first matched that exact request, item and operation, then used normal Done. Final observations show the original actor/household scopes and 64 empty journals on both simulators. The 11 snapshot counts and durable database identity are preserved during foreground restoration. Selected private plans were removed and scoped caffeinate processes stopped; original signing/configuration credentials and Keychains were preserved.

## Visual evidence and boundaries

All **34 exported PNGs** were individually inspected and contain only the authorized fictional simulator scope. `visual-review.json` inventories their hashes. Representative captures:

- [Exact future fields before the single Save](created/create/E8A32D89-8FEA-4BA3-BE9F-85942D34E543.png).
- [Recorded immutable request](created/create/C6CF07C1-F4BB-4931-83A6-1727D9BD8D27.png).
- [Saved-request section cleared; active row retained](done-recovery/done/76E3DF93-1FAB-4F8B-A6B7-4039FF6D83EF.png).
- [Final Alex Today](foreground-restoration/alex-today.png) and [final Sam Today](foreground-restoration/sam-today.png), both large/light with Me + shared.

Historical `*-terminal.png` captures include SpringBoard after XCTest teardown; they are not foreground Today proof. In-test Today/profile captures and the final ordinary foreground launches provide that evidence. The unsent draft in the picker-observer failure was not explicitly discarded in that failed method; no draft-preservation claim is made for process termination.

This phase did not test active reminder draft navigation, maximum text, reminder Save/restart/recovery, final removal, physical devices, radio loss, full accessibility audits or published-build behavior. Raw xcresults, movies/binary snapshots, full build logs and the raw host-log payload remain private; each result's omitted attachment inventory is retained. Only sanitized records, native test logs with trailing whitespace trimmed, public screenshots, frozen input hashes and executed controllers are exported.

## Verification

Run the immutable inventory and semantic verifier from the repository root:

```sh
python3 evidence/2026-10-06/swiftui-native-renewal-reminder/verify_inventory.py
```

It verifies Git-tracked artifact hashes, every attachment reference and PNG review, the frozen source maps against their immutable Git objects, per-batch results, whole canonical preservation, exact receipt binding and final scopes/journals. Optional `--working-tree` checks the final UI map against current native inputs. JSON/Markdown formatting covers the complete exported file list before checksums. Native tests and controller executions are not rerun by the verifier.

Source `aecb4b60` passes [routine CI](routine-ci.json) and [native CI](native-ci.json): 506 Foundation tests/41 skips, 464 signed-app tests/32 skips, four Swift Testing cases, zero failures. Strict formatting, source limits, signing and guarded UI compilation pass. Hosted opt-in and real UI methods above are separate executions, not CI runtime coverage.
