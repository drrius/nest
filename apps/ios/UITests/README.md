# Signed-in accessibility smoke

`NestAccessibility` is a separate, manually selected XCUITest scheme. The default
`Nest` scheme and routine CI do not run it. CI still checks these Swift sources for
formatting and source limits.

Use an authorized test simulator with an existing signed-in test-member session,
completed first-use setup and empty command/decision journals. Supply the normal
public test configuration through a protected xcconfig. Do not use a production
account, authentication bypass or fake API responses.

```sh
xcodebuild -project apps/ios/Nest.xcodeproj -scheme NestAccessibility \
  -configuration Debug -destination "platform=iOS Simulator,id=$NEST_QA_SIMULATOR" \
  -xcconfig "$NEST_QA_CONFIG" -parallel-testing-enabled NO \
  -resultBundlePath "$NEST_QA_RESULT" \
  CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- test
```

Run serially while holding the simulator's exclusive UI actor lock. The tests cold
launch the real app, require the authenticated four-tab shell, navigate each tab,
wait for its root content and run Apple's full accessibility audit. They do not
save forms, invoke AI, complete chores, check groceries or change sharing controls.
Calendar uses the device's existing permission state and calendars.

Inspect every audit finding. The diagnostic handler attaches issue descriptions
and element bounds and returns `false` for every issue; it suppresses nothing. An
unavailable session or missing required content fails rather than skipping. The
result bundle can contain private rendered content; keep it local and publish only
audited summaries or safe screenshots.

These checks cover each tab's initial viewport. They do not establish all scrolling
content, forms, VoiceOver navigation, haptics, both phones or full M1 acceptance.

`CalendarReadabilityTests` additionally scrolls the unrequested-permission copy
above the tab bar and checks the access button's target size, without pressing it.
Run that method separately under the simulator's supported text settings;
restore the original size and appearance afterwards. Its fixture specifically
requires Calendar permission to be unrequested.

The partner-availability reading method additionally checks overlapping beginning
and ending viewports of the unknown-availability explanation. At maximum text the
paragraph can be taller than the usable screen; the test requires both boundaries
and continuous coverage through scrolling rather than demanding a single viewport.
It requires the authorized fixture to have unknown partner availability.

The 5 October full audit remains failing. See the [recorded findings](../../../evidence/2026-10-05/swiftui-accessibility-audit/README.md).
Do not use a successful focused reading check as approval of the full audit.

`testVisibleUnknownAvailabilityContrast` requires the entire unknown-availability
paragraph to fit above the native tab bar before auditing the current viewport's
contrast. Run it at an ordinary text size with the unrequested-permission/unknown
availability fixture. It records every reported issue through the same diagnostic
handler as the root audit, suppresses none and returns to Today even on failure.
It remains a failing diagnostic, not an accessibility approval or a CI gate.

Receipt-picker cancellation and unposted upload/removal methods use the clearly
marked local PDF fixture. The posting method is different: it requires the runner
environment `NEST_QA_POST_PDF=20261005` and creates one permanent CHF0.02 test
expense. It must never run against production or after that named fixture exists.
Use a fresh result directory, preflight the fixture count as zero and inspect
any interrupted outcome before another action. This fixture has now been posted;
do not rerun its creation. Without explicit opt-in the method skips.

`NEST_QA_READ_POSTED_PDF=20261005` opts into the separate existing-entry navigation
method and the hosted `NestAppTests/HostedPDFReceiptTests` byte-download method.
They read the existing synthetic expense and must use the authorized test origins
and preserved real member session. The browser method additionally opens Apple's
in-app browser, checks its dismissal target and returns to the same expense and
Today. Its screenshot needs independent inspection for actual PDF rendering; a
WebView alone is not proof of loaded content. These methods create no expense,
and the manual opt-ins are not enabled in routine CI.
