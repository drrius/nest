# SwiftUI saved-recipe assistant results

1 October 2026. Branch `codex/swiftui-assistant-recipe-links`, based on `52f654cb`.

Successful canonical `createRecipe`, `editRecipe` and `archiveRecipe` results now render a receipt and native record link instead of the unsupported-result message. The typed parser binds actor, household, tool, input target and exact/bounded revision through the existing shared-command validators. It rejects pending/failed results, mismatched targets, foreign scopes and model-supplied operation identities. Receipts describe historical confirmation; destinations independently refresh current state.

A dedicated destination refreshes the library even when cached, follows strict ordered pages at the same revision to locate a saved recipe, and refuses a failed fresh read. A fully scanned missing recipe displays the existing missing state. Archive navigation opens the freshly read library; the old receipt does not assert current absence or change planned meals. Generation and membership fences reject delayed old-account reads. Navigation invokes no mutation or model.

## Focused verification

- Three Foundation parser cases pass, zero failures/skips: `/private/tmp/nest-assistant-recipe-core.log`, 0.003s.
- Two configured simulator destination cases pass, zero failures/skips: `/private/tmp/nest-assistant-recipe-destination.log`, 0.138s; xcresult `Test-Nest-2026.10.01_06-58-18-+0200.xcresult`. Covers a recipe beyond page50, complete missing detection, fresh revision changes and delayed account switching.
- The added unavailable-fresh-read case passes, zero failures/skips: `/private/tmp/nest-assistant-recipe-unavailable.log`, 0.082s; xcresult `Test-Nest-2026.10.01_07-07-51-+0200.xcresult`. Cached state cannot become a successful destination.
- Three existing native recipe edit/recovery/account tests pass, zero failures/skips: `/private/tmp/nest-assistant-recipe-native.log`, 0.235s.
- The explicitly enabled, read-only presentation fixture passes, zero failures/skips, 19.583s: `/private/tmp/nest-assistant-recipe-presentation.log`. It hosts the shipping history and destination views in a temporary window on owned SE simulator `C3ABC0D4-CFD4-4F23-8CC3-0E542014803A`, using controlled authenticated transport. Actual upper-right corner taps on both303×44pt links reached recipe detail and saved meals. Both back taps reloaded the original history. This is controlled native UI evidence, not a real provider/hosted transcript journey.
- Final strict Swift formatting, file/function/complexity limits, configured app compilation, actual push-disabled simulator signing and all816 Linux/Mac source/signing hashes pass. The original scheme/window and ordinary configured Test Alex app were restored. The fixture uses only temporary SQLite; no hosted command, real credential, calendar or financial mutation occurs.

The initial fixture had an initializer ordering compile error, then the wrong synthetic transport token, then an invalid empty-ingredient create draft. Those failed attempts do not count as success. Final fixture validates its canonical result before presenting and uses the same Quiet tint as the application. One relative-path rsync attempt was rejected; a single-file transfer completed and all hashes match. XCTest logged accessibility-window errors during fixture teardown; final actual taps/captures and the test passed, but this is not VoiceOver evidence.

## Captures and limits

[History](history.png), [current recipe](current-recipe.png), [current library](current-library.png), [tap evidence](verification.json). Captures show ordinary large text/light appearance on375×667; no maximum Dynamic Type, dark, VoiceOver, Reduce Motion or physical-phone acceptance is claimed here. Parser checks cover edit results; actual taps used create and archive receipts. Live AI remains blocked by Gateway HTTP403/billing eligibility. No model/tool invocation or successful provider streaming is claimed. Build12 lacks this slice; no new beta, production change, deployment, purchase, automation, PR or merge was made.

Implementation: [result parser](../../../apps/ios/Nest/Core/AssistantRecipeLink.swift), [history](../../../apps/ios/Nest/Assistant/AssistantHistoryScreen.swift), [row](../../../apps/ios/Nest/Assistant/AssistantRecipeRow.swift), [destination](../../../apps/ios/Nest/Assistant/AssistantRecipeDestination.swift), [fresh library orchestration](../../../apps/ios/Nest/Session/SessionModel+AssistantRecipe.swift), [opt-in UI fixture](../../../apps/ios/AppTests/AssistantRecipePresentationFixtureTests.swift). Existing canonical SQL projects authoritative journal `input` and `result`, strips matching provider-written parts, and appends the recipe commands: [journal projection](../../../supabase/migrations/20260923061318_native_ai_recurring_reminders.sql). No backend/schema change was required.

CI for this slice is pending its source push; earlier preparation head `b6c6a595` passed Nest36816315811 and SwiftUI36816315806, and evidence head `52f654cb` passed Nest36816602143.
