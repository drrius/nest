# Native unsaved portion preferences

The portion selector now uses a native navigation picker. Its compact menu's
1.5 choice measured 42 points; the replacement keeps the same eight allowed
half-portion values and the brief's 44-point target requirement.

Eight actual native methods pass with no skips: each member's GET-only profile
before and after, plus normal/light and largest-text/dark draft journeys for
each member. Alex selects an unsaved 1.5 portion and Sam an unsaved 0.5 portion.
Keep editing retains the choice, explicit Discard saves nothing, reopening shows
the original default/saved value 1, and each method returns to Today. The normal
UI methods finish in 69.934/39.430 seconds and maximum methods in
171.662/165.966 seconds. Thirteen isolated database/PostgREST cases also pass
with zero failures/skips.

All twelve before/edit/discard action PNGs are directly reviewed. Original
actor/household scopes, 64 empty journals, actual large/light settings and local
calendar/privacy/ingredient semantics restore after each invocation. The UI
source is `edad88b9`; fresh products have 1,134 frozen source inputs, fixed test
origins, push disabled, actual signing and three verified binary hashes.
The native GET products retain their actual `e7b1ad87` source; the only differences
are the UI test observer and FoodPreferenceFields presentation. Domain,
authorization and the read-test body are unchanged. Old products are not relabelled.

Both members' canonical profile JSON matches before and after. Alex remains
revision 5, Vegetarian, portion 1 and no calorie goal. Sam's profile remains
absent; an unsaved default is not confirmed dietary information. The private
API read for Sam does not expose Alex's profile. Safe status traces contain only
GET paths/statuses, not credentials, headers or response URLs.
[Independent hosted metadata](independent-hosted-verification.json) separately
confirms profiles, shared cooking revision 6, all food/cooking receipts and eight
protected source/library/grocery/financial fingerprints exact. Privileged metadata
is not the native authorization proof. No Save, new profile, hosted SQL mutation,
model request, production action, merge or beta release occurs.

Failures remain preserved: the first SDK compilation uses a nonexistent API type;
the existing MealAPI verifier corrects it. The first UI observer expects a value
where the original control exposes selection in its label. The corrected observer
then finds the genuine 42-point menu-choice issue. After the shipping fix, the
draft/discard behavior works but its final exit observer expects the draft Back
label on an unchanged form. Correcting that native back lookup yields the complete
passes. The three failed UI methods and failed preparation are not counted as
passes. No committed command is replayed.

Routine CI 37547556252 and native CI 37547556372 pass `edad88b9`. Native CI
runs 506 Foundation tests/41 explicit skips, 472 signed-app tests/40 explicit
skips and four Swift Testing cases, zero failures. Strict formatting, limits,
signing and guarded UI compilation pass. [CI evidence](native-ci.json). Actual native execution is distinct from CI's
opt-in skips and guarded compilation. This result does not establish saved
varied-portion planning, a live AI generation/replacement, full accessibility,
VoiceOver/haptics/radio-loss behavior or either physical phone's acceptance.
