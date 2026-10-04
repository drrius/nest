# Saved meal library and recipe offline reads

Verified4 October2026 against the separate fictional nest-test household. This closes a concrete missing offline-read capability, not full M5 or M2 acceptance. Build15 predates this change. No new beta, production access, service purchase, worker activation or merge occurred.

## Result

The native saved-meal library and visited recipe details now persist in real SQLite, scoped to the verified member and household. Recipe detail copies also bind the exact library revision. Previously visited library pages survive an unchanged revision refresh and process restart. Saved copies display their recording time and remain read-only: a cached library cannot supply fresh assistant-result proof or a new meal-edit/financial-command preflight.

Typed targets validate scope, revision, recipe identity, pagination and stored envelope metadata. A newer response wins persistence over an older attempt. Network unavailability can fall back; authorization, contract and revision-conflict refusals cannot. Authoritative removal purges recipe and financial read snapshots before the lease is deactivated, with generation and scoped-lease checks protecting a newer account. Uncertain command journals are preserved.

## Meaningful tests

Six Foundation tests execute real SQLite restart/isolation/latest-response/corruption/revocation and visited-page retention cases. The initial signed-native group executes27 methods: six new recipe snapshot cases, fourteen existing library/account/recovery cases and seven money snapshot regressions, all passing without skips. The native tests use injected HTTP responses; they prove native model/SQLite behavior, not live provider behavior.

A final native group executes21 methods: seven recipe snapshot methods and the fourteen library regressions. Its new case drives a forbidden recipe response followed by fresh membership removal and then reopens the database, proving old financial/recipe reads do not revive after rebinding. This caught purge being attempted after lease deactivation; the correction purges first. The later21-method run and earlier27 overlap and must not be added as unique tests. There are34 distinct focused tests overall, including the six Foundation methods. Strict Swift formatting/source limits and actual signing pass.

## Actual native and hosted proof

The owned375×667 iPhone simulator runs the signed candidate with the existing fixture's data/Keychain preserved. A read-only relay forwards existing native member authentication to the stable test API, never logs credentials, and refuses every POST. The existing populated library and selected recipe return200 and persist under the correct actor/household. After a real process restart and controlled API503 failures, both destinations show the saved data and recording-time notice.

The initial maximum-text dark screenshot exposed an oversized notice displacing the recipe. Shorter copy and native footnote styling correct that hierarchy; a second signed candidate loads the same snapshots with the relay stopped, and its notice and recipe title are visible together at maximum text. This later pass uses controlled connection refusal, not physical radio loss. `native-inputs.json` identifies the first candidate; `layout-native-inputs.json` identifies the rendered copy/layout correction; `final-native-inputs.json` includes the later removal-order correction. All1,037 repository native inputs match their corresponding isolated Mac candidate. The final membership correction changes removal behavior, not the rendered recipe layout.

Independent regular-account reads before and after agree for both members on all library pages, detail and complete financial history/balances. Outsider reads return403 and anonymous reads401. No hosted mutation occurred. Expired command-line fixture sessions initially returned401; only those three regular verifier sessions were refreshed, leaving native Keychain sessions unchanged, before the passing final comparison.

The final app is restored to stable test origins and ordinary Today/light/default text. Data/Keychain and existing saved financial reads remain. Expense/grocery journals are empty; handover intent was also checked empty during the recipe pass. The owned relay is stopped and its generated private key destroyed. Its short-lived simulator certificate is not evidence of hardware TLS configuration. `final-restoration.json` and the screenshots record this bounded restoration.

## Evidence boundaries

JSON accessibility trees and screenshots are actual native execution; test excerpts are native/Foundation execution; hosted comparisons prove only the separate test fixture. The allowlist excludes databases, config values, tokens, certificates and private keys. `raw-export-hashes.json` hashes the original Mac export; `artifact-hashes.json` records repository-formatted artifacts. Required exact-source routine/native CI is pending until this increment is pushed.

Real radio loss, full pagination rendering with51 actual saved recipes, VoiceOver, partner/device races, both phones, full meal-week/approval usability and owner design acceptance remain open. Local51-page aggregation tests do not prove hosted/native51-recipe rendering. Live AI remains separately blocked by Gateway eligibility; fixture results cannot close it.
