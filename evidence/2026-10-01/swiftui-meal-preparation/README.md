# SwiftUI linked meal preparation

Bounded verification on the owned iPhone SE simulator, against the isolated `nest-test` API and fictional Test Alex/Test Sam household, 1 October 2026. Production is untouched. This does not close M1, M2, M5 or M9.

## Implemented behavior

Planned meals open fresh preparation reads and a native create/edit form. Preparation is date-only household work, with shared/assigned/alternating responsibility and the existing nonblocking availability check. No reminder consent, meal-plan approval or financial mutation is implied. Finished tasks retain their date/responsibility; archived tasks cannot be edited. Unchanged legacy Unicode text is omitted from patches. Exact six-digit routine versions and nullable instruction edits survive encoding and recovery.

One actor/household-scoped SQLite request survives uncertainty and restart. Fresh week/preparation/roster preflight preserves stale drafts. Explicit retry retains the original operation/body; an acknowledged request only refreshes. Terminal rejection requires explicit discard. Account generations and leases fence every asynchronous step. Meals exposes recovery even when the original meal disappears. Successful own-scope assistant preparation receipts link to fresh native reads; live provider execution is still blocked separately.

## Actual owned journey

1. A normal test API placement creates one fictional meal in the previously empty 5–11 October week (revision14→15). The normal configured native app reads it and shows preparation absent.
2. The initial Add/Refresh labels expose20.5pt bounds despite an exterior44pt frame. Sizing the actual labels yields335×44pt. An upper/right corner tap opens Add. Explicit Cancel→Discard works without a save.
3. Actual native typing enters the task title and instructions; Done dismisses both keyboards and preserves text. Shared is the default. Both availability warnings are honestly unknown and do not disable Save. One native Save creates preparation; both members read identical data. An outsider is denied read and edit; the refused edit changes nothing.
4. Native Edit loads the current task. Actual editing changes its title, clears instructions and explicitly chooses One person→Test Sam. One native Save retains routine/occurrence IDs, advances the exact routine version, stores `instructions:null` and updates assignment. The week remains revision15.
5. Corrected source is rebuilt/reinstalled. All810 tracked native/signing inputs match. At the largest accessibility text size, light/dark top/bottom checks keep Refresh and the native tabs reachable; original large/light settings are restored.
6. Native meal Options→Remove displays the exact fictional title/date/slot and linked-task warning. Explicit confirmation removes only that meal (revision15→16) and skips its linked task. Both members see the empty week. The normal exact API archive command archives the owned routine, retaining history. Today is restored.

Creation/edit use `f79383d3` plus the preparation touch correction. Largest-text reads use `e0bd72b9`; final removal additionally uses the visible Options label correction. The final exact source, protected hashes, journal counts and cleanup checks are recorded in `verification.json`.

Seven protected API projections remain exact: balance, history, Calendar consent, groceries, renewals, recipe library and the original 28 September meal week. No revision reset or direct journal deletion is used. Diagnostic credentials remain private and are not included in artifacts.

## Verification

- Six actual Node/Effect schema cases pass, including shared Swift wire fixtures, exact microseconds, nullable/omitted instructions and Unicode title boundaries.
- Initial seven Foundation/SQLite/link cases pass; the final Unicode increment passes eight (0 failures/skips, 0.183s; Mac `/private/tmp/nest-preparation-core-unicode.log`).
- Five new configured native model cases pass (0 failures/skips, 0.407s), covering lost replies, original retry after restore, acknowledged read failures without resend, stale/foreign drafts, delayed account receipts and explicit terminal discard. Final preparation plus recipe regressions pass eight (0 failures/skips, 0.631s; `/private/tmp/nest-preparation-final-model.log`, `Test-Nest-2026.10.01_06-26-36-+0200.xcresult`). These transports are controlled fixtures.
- Strict whole-client Swift formatting, source/function/complexity limits and actual push-disabled simulator signing pass.
- `f79383d3`: Nest36814109548 and SwiftUI36814109521 pass (380 Foundation cases/41 opt-in skips;220 native cases/four opt-in skips; zero failures).
- `e0bd72b9`: Nest36815203591 and SwiftUI36815203600 pass (381 Foundation cases/41 opt-in skips;220 native cases/four opt-in skips; zero failures).

## Limits and excluded claims

The formatter initially received the JSON fixture and refused it; the corrected invocation formats Swift files only. A first image-only meal menu label attempt did not change the agent's nil outer Button label. A visible Options descendant now has a44pt target and opens the correct menu; complete VoiceOver naming remains unverified. No false VoiceOver sign-off is inferred from AX inspection.

Native Take turns, preparation date editing, completed-task metadata taps, populated overlap warnings, concurrent partner edits, actual offline/reconnection, full VoiceOver/Reduce Motion and both-phone acceptance remain gaps. Online-only preparation writes are never added to automatic offline replay. Largest-text read screenshots are selected checks, not every-screen acceptance. No new beta/cloud build, provider call, production change, purchase, automation or PR merge occurred. Available build12 lacks this slice and the newer recipe fixes.
