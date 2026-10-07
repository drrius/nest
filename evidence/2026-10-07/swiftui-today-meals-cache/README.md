# Today saved meals during refresh

Today previously cleared its meal card before every read and waited for a network
reply before showing a cached week. It now reads the scoped SQLite week first,
labels it as saved while refreshing, and retains it through an unavailable reply.
Authorization/contract failures clear the card instead of displaying them as
empty or successful reads. The card resets when the session generation or civil
day changes, so yesterday's meals and an earlier session do not remain visible.

The cache read verifies the cached credential identity, current member, generation
and active SQLite lease before and after suspension. It does not refresh tokens,
change the week selected in Meals, stage a mutation or resend saved operations.
No cache returns nil, rather than an invented empty week.

Five signed app tests pass without failures or skips. They use actual SessionModel,
MealAPI and SQLite with controlled authentication/HTTP, proving cache availability
while the network read is held, a missing week, no authentication refresh, changed
identity/generation refusal, offline versus forbidden handling and late-account
read refusal. [Results](summary.json), [cleanup](cleanup.json) and
[executed hashes](source-hashes.json). The separate owned simulator is deleted;
original clients and hosted data are not used.

A separate signed SwiftUI rendering probe uses the shipping TodayMealsSection in
UIHostingController with the same real local persistence and controlled delayed
HTTP. Captures show Saved pasta and the saved-information label during the held
read and after an unavailable reply. It does not prove hosted connectivity,
phone gestures, navigation destinations, VoiceOver or a complete Today journey.
The probe is guarded in ordinary CI and forbidden on physical phones.

The first captures exposed a default-blue link. The card now applies the existing
Quiet olive tint; the final guarded capture method passes once without skips and
both final screenshots are inspected. [During the held read](render-final/37525688-8DE3-4F3A-9DFB-AB78B76BB652.png)
and [after unavailable](render-final/E5913966-392D-4708-BB84-DA44EC2EDC5D.png) retain
the full meal and honest saved label. [Render results](render-final/summary.json),
[cleanup](render-final/cleanup.json) and [final source](render-final/source-hashes.json).
Initial blue captures are retained as diagnostic evidence. The five model tests
precede the one-line tint change; their session/cache source remains unchanged.

Current-source CI remains pending. TestFlight build
22 remains unchanged. No production, hosted household, credentials, provider,
scheduler or push configuration changes are made. M1/M4/M5 acceptance stays open.
