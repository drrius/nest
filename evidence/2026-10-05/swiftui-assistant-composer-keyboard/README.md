# Private composer keyboard

5 October 2026. This is bounded signed-native input verification on the owned
iPhone SE (third generation) simulator, not a live model or physical-phone test.

## Defect and implementation

At source `2ffc3504`, one fictional multiline draft and one real final character
leave the selected text/caret behind the keyboard at largest Dynamic Type.
Send is absent from the visible native tree. The baseline capture preserves that
failure; no message was sent.

The corrected composer uses the shared `QuietTextEditor`, the already verified
native TextKit1 input control previously used for Cooking notes. Its accessible
label is supplied by each caller. An iOS bottom safe-area inset keeps one native
Send action above the keyboard. Its interactive label is at least44pt. Existing
send, private recovery, cancellation, authorization and2,000-UTF16 validation
remain in the same model/service. The counter retains a full semantic label and
scales its visual text within one line rather than splitting the limit's digits.

## Native execution and scope

- Both corrected normal/light and largest/dark journeys fill the same unsent
  eight-paragraph draft, append one actual `!`, then use Back and reopen an empty
  composer. Actual images show the complete selected final line and caret and
  the Send arrow above the keyboard tray. Preceding lines may scroll offscreen.
- These journeys ran before the final counter-only layout adjustment; their
  exact1,045-input hashes are in `native-inputs-*.csv`. Final input hashes and the
  repeated focused native verification are separately prefixed `final-`.
- Strict Swift formatting, source limits and actual signing pass. Each source
  candidate passes13 signed-native methods: native editor input/font/caret/disabled
  editing, preference models, offline/disabled composer retention, uncertain
  recovery identity and delayed account reads. Six focused Foundation methods
  pass; two hosted credential-dependent methods explicitly skip.
- The long-message observer reports `COMMAND_FAILED` after one successful input.
  Its accessible value readback is512 characters; the native counter reports
  2,001 and Send is disabled. The original input is never repeated to repair
  observation. Exact full long-text readback remains unverified. The native editor
  method independently preserves2,000 UTF16 units including surrogate pairs.
- The first corrected long-message image exposes a wrapped limit counter, which
  prompted the final one-line adjustment. Preserve this intermediate failure;
  do not treat it as final layout evidence.
- Final source now renders the complete2,001/2,000 counter on one line above the
  keyboard. One actual Delete at the visually inspected native key changes the
  semantic counter to2,000 and enables the44pt Send action; it is never pressed.
  The whole selected final line/caret remains visible. Native key hit-testing
  metadata reports that lower keyboard keys are covered despite the actual image;
  the one key coordinate comes from its snapshot bounds and inspected image.
- Back/reopen yields an empty composer, then ordinary Today/light/default text
  is restored. All64 local journals remain empty and original food/cooking
  profiles remain exact. The bounded separate-test SELECT preserves all ten
  full-row aggregate hashes/counts, including15 conversations,13 old turns,
  zero conversation saves and61 append-only financial events. This is retention
  evidence, not a fresh RLS audit or successful provider call.

`before-*` is the baseline; `first-fixed-*` is the first correction; `final-*`
identifies final-source verification. Node CSVs preserve canonical JSON for each
observed node, while adjacent JSON retains journal/profile metadata. The fictional
drafts are unsaved. No Send, Save or provider request is exercised by this check.

## Acceptance still open

This does not verify successful streaming, tools, approvals initiated by a real
model, full recovery rendering, VoiceOver, motion or either physical phone.
Gateway's last actual response remains403 `customer_verification_required`.
TestFlight remains build16. No new beta, production action, credential change,
worker activation, purchase, source merge or automation occurs here.
M1–M9 full acceptance remains open. Source `f77d5846` passes routine CI37282661041.
Native CI37282660851 is still running at the recorded observation; it is not
claimed passed. [Exact-source CI state](ci-f77d5846.json) is distinct from the
13 focused Mac methods and the existing phone build16.
