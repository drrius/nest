# Native private-memory consent — 5 October 2026

Final action-layout source: `bf0542d4db9f90192bbdd6ea8e0cde3d710ba2a4`.
Native add/edit/decline and pending-proposal restart ran at `49c526d6`.
Their editor/request/domain source bytes are unchanged by the final row-layout fix.
Final removal/cancellation and largest-text Edit reopening ran at `bf0542d4`.
All 1,041 final native inputs match committed source and the authorized Mac.

Actual rendering exposed small controls, an unnamed field, awkward toolbar label
wrapping/clipping and a rounded Remove corner that failed at maximum text size.
The final editor has a named field, a keyboard Review action and adequately wide
44-point-high toolbar controls. Exact text still needs separate Save consent.
Edit/Remove now use rectangular labels and stack at accessibility sizes. Native
Discard/Remove alerts have explicit Cancel and short readable copy. No domain,
authorization, approval, financial or retry rule changes.

Two focused signed-native consent/recovery/account methods passed at `0ea52337`,
with zero failures/skips. Later signed builds pass strict format/limits and source
identity; they are not counted as additional test executions. Final-source
[routine CI](https://github.com/drrius/nest/actions/runs/37257095087) and
[native CI](https://github.com/drrius/nest/actions/runs/37257095096) pass, including
491 Foundation cases/41 explicit skips and 409 signed-native cases/11 explicit
skips, zero failures, strict formatting/source limits and actual app signing.
Earlier superseded native runs are cancelled, not passed. Both checks also passed
the earlier toolbar source `49c526d6`.

On the owned iPhone SE3/iOS26.3 simulator, using real separate-test API commands:

- Normal/light and largest-text/dark draft Cancel retains exact fictional text,
  with all 64 mutation journals empty. The exposed keyboard Review corner sends
  one proposal, without saving a memory. The pending exact request/approval survives
  an actual process restart and reopening, with no automatic decision/retry.
- Full fictional addition text is inspected at maximum text size; one separate
  Save corner creates exactly revision 1. Native Done clears the terminal slot.
- The Edit corner opens the original value independently of Remove. The exact
  replacement is proposed separately; the pending proposal leaves revision 1
  unchanged. One explicit Save creates revision 2. Done clears its terminal slot.
- One distinct proposal is explicitly declined through Don’t save. Its approval
  becomes denied and revision 2 remains unchanged. Done clears only that decision.
- At final source, both normal/largest Remove corners open the intended native
  alert. Visually complete title/message/actions and corner Cancel stage nothing.
  Largest Edit independently reopens the unchanged value; Cancel dismisses it.
- One final native Remove produces revision 3 with null content and a private
  removal receipt. Native Done clears the terminal slot. Both active memory lists
  return to their original empty state; the tombstone/history is retained.

Independent ordinary fixture sessions verify each real pending proposal's exact
payload and populated approval RLS: owner sees one known row; partner/outsider see
zero; anonymous access is denied. Proposal API reads are owner-only. Before the
first save, altered text returns 400, partner/outsider decisions 403 and anonymous
401; consent stays pending and no active memory is created. Known revision-1 and
revision-2 memory/receipt RLS and the removal receipt give owner one row,
partner/outsider zero and anonymous 401. The edit's independent pending checks
finished 37.94 seconds before its native consent intent. Replaying the original
revision-1 exact approval after removal returns its original receipt and preserves
the revision-3 tombstone; it cannot resurrect the memory.

Both members' complete financial histories (pages of 50 and 11 events) and zero balances remain
exactly unchanged. Ordinary Today/default text/light, stable signed test origins,
original actor/household, data/Keychain and 64 empty journals are verified after
restoration. No fault relay, generated key, live model, worker, beta, production
operation, purchase or merge is used. Existing receipt bytes were not inspected.

Observer failures are recorded. Toolbar containment needed a dedicated finder;
44-point floating representations allow a 0.001-point epsilon. Earlier 36-point,
wrapped and clipped keyboard controls are preserved separately. A text-entry tool
reported TEXT_ENTRY_MISMATCH and left a malformed unsaved edit; actual inspection,
native Select All and keyboard replacement established the exact draft before any
proposal. No malformed text was submitted. The largest rounded Remove corner
really missed; it was fixed rather than retried as a passing action. The first
layout candidate stopped on strict formatting before Xcode; canonical formatting
preceded the passing signed build. API and native observers briefly overlapped,
but recorded times prove the edit's pending checks completed before consent.

This is bounded M1/M3 execution. Complete 1,000-character editor/review behavior,
VoiceOver speech/focus, hosted lost-reply/conflict/expiry/account-switch rendering,
two native clients/both phones and live AI tools remain open. Edited proposal
readability is not claimed from the input observer alone. Neither a manual native
proposal nor a controlled transport test proves live model behavior. M1–M9 remain
incomplete; the available phone build is still build 16, older than these changes.

`native/` contains actual pixels, target records, scoped journals and bounded node
CSVs; earlier source identities/candidates are explicitly retained. `inputs/`
contains bounded final-source hash shards; `builds/` distinguishes tests/builds.
`api/` contains exact fictional commands, approvals, privacy probes, canonical
financial pages/hashes and cleanup/replay proof, without credentials. Current
installed signing/environment identity is in `current-source.json`.
