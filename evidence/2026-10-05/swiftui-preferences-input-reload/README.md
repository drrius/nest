# Native preferences input and reload controls — 5 October 2026

Current source: `9adbc3eb5c82b2e2e877790efa8247351a701003`.
The food/control fix is `b9652140`; the later commit only gives cooking notes
an explicit accessibility name. Food/control source bytes are unchanged by it.
All 1,041 final native inputs match committed source and the authorized Mac.

Actual rendering exposed three problems: a calorie input could sit behind the
navigation bar at maximum text size, the normal portion picker exposed less than
44 points, and the old reload confirmation showed a single-action popover without
a visible Cancel. The first candidate expanded the input's bounds but a corner
tap still failed to focus it. The final fix uses a stacked calorie label/input at
accessibility sizes, native focus on the expanded input, a 44-point picker label,
and short native alerts with explicit Reload and Cancel. Cooking notes now have
an explicit semantic name. No domain, authorization, retry or privacy rule changes.

Eight focused native preference/preflight/recovery methods pass at the food/control
source with no failures/skips. A signed build also passes at the final label source;
that build is not counted as another test run. Final exact-source
[routine CI](https://github.com/drrius/nest/actions/runs/37251890365) and
[native CI](https://github.com/drrius/nest/actions/runs/37251890375) both pass:
491 Foundation cases/41 explicit skips and 409 signed-native cases/11 explicit
skips, zero failures, strict format/source limits and actual app signing.
The prior native run at `b9652140` was superseded/cancelled, not passed.

On the owned iPhone SE3/iOS26.3 simulator with the real separate test API:

- Normal/light and maximum-text/dark calorie-field corner taps open the keyboard.
  `0` disables Save; `1600` enables it. No Save is selected. Inspected images show
  the whole input value above the keyboard and the exposed toolbar control.
- Food Reload opens its intended alert at both sizes. The title, message, Reload
  and Cancel are visually complete. Corner Cancel preserves unsaved `1600` and
  all 64 mutation journals stay empty. One explicit Reload restores the original
  blank goal without saving a preference.
- The maximum-text portion corner opens the native menu. Selecting the existing
  value `1` leaves the preference unchanged. Other values are not exercised.
- The final cooking field has the semantic name “Cooking notes”. Fictional unsaved
  notes are entered with a keyboard. Both normal and maximum-text Reload alerts
  show full titles/messages/actions; Cancel preserves the exact notes and stages
  nothing. One explicit cooking Reload restores the original blank notes.
- Cooking and Profile are explicitly popped to ordinary Today; default text/light,
  stable signed test origins, the original actor/household, data/Keychain and 64
  empty journals are preserved. No fault relay, generated key or worker is used.

Both members' original food/cooking values and revisions, setup states, complete
61-event financial histories and zero balances remain exactly equal after all
checks. Independent verifier sessions are renewed without changing native Keychain
sessions. Full financial reads are compared, with their hashes recorded; this pass
does not inspect receipt bytes or perform a new RLS audit. Partner food-profile
absence remains the existing fixture limitation, not completed partner native QA.

Observer failures are retained honestly. Empty native fields can report null rather
than an empty string; alert container labels duplicate their text nodes. The first
calorie corner really failed and required a shipping focus fix. Later form searches
started from the wrong scroll end; one premature portion observer overlapped a
reload observer and was stopped. The already-selected Reload was not repeated.
Largest cooking Cancel was already selected before its field search was stopped;
a fresh serialized search proved the retained notes without selecting Cancel again.
An added QA-only exclusive UI lock prevents overlapping future phases. A helper
syntax failure occurred before native actions and was corrected before rerunning.
A launch-time empty snapshot and downward search missed Today's header; supported
scroll-to-top resumed navigation without reinstalling. These are not product passes.

This is bounded M1/M3 verification. Rejected/pending preference recovery rendering,
restriction/dislike corner controls, full VoiceOver speech/focus, broader onboarding,
B's populated native forms, both phones and live AI handoffs remain open. Largest
cooking notes are verified through the exact native value; the observer's scroll
leaves their multiline content partly behind the keyboard, so complete cooking
keyboard readability is not established by that retained-value image. No native
preference Save, financial write, model request, beta, production action, purchase
or merge occurred. M1–M9 remain incomplete.

`before/` and `first-candidate/` preserve the observed old layout/cancellation and
failed corner. `native/` contains actual pixels, target records, node CSVs and scoped
journal metadata; `current-source.json` identifies the final installed executable.
`inputs/` contains bounded source-hash shards. Test/CI summaries and both canonical
API preservation records are included without credentials or full build logs.
