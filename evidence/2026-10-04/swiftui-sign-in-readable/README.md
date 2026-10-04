# Readable native Apple sign-in at maximum text

4 October 2026. An actual clean signed build16 cold launch on the owned iPhone SE3/iOS26.3 simulator exposed truncation of the headline and introductory copy at maximum Dynamic Type. The Apple button remained reachable; the missing copy is a real UI defect. [Before](../swiftui-m0-foundation/auth-largest.png).

`AppleSignInView` now uses a vertical ScrollView with full-width content and bottom spacing. It preserves native typography and Apple's genuine50-point sign-in control. Clipping the scroll viewport also prevents enlarged scrolled text from drawing over the status bar; that issue was found in the first rendered trial and corrected before this final check.

The actual signed app is built on the Mac from all1,037 input hashes with precisely this edited native file. Strict Swift formatting and source limits pass. Normal text retains the same layout and button geometry. Maximum text has complete headline/explanation wrapping without ellipses; an actual scroll reveals the remaining copy and fully visible327×50-point Apple button. [Top](largest-0.png), [scroll/action](largest-1.png), [normal](normal-0.png). Final screenshots are visually inspected; accessibility snapshots are recorded, not presented as VoiceOver execution.

No Apple authentication or permission control is selected. The clean owned simulator is shut down after both states, and the original authenticated simulator/data remain untouched. There is no new TestFlight upload or production action. This fix is newer than the available build16 beta, despite the local debug bundle retaining16 for these checks.

Native build/signing/rendering, formatting and source limits are locally verified. Exact-commit CI is pending at this evidence checkpoint; passing previous build16 CI is not claimed for this change. No new mirror test or full local unit-suite rerun is added for this view layout correction; the existing exact-source CI suites will check regression safety. Physical phones, VoiceOver, error/authentication-interruption states and full Quiet acceptance remain open.
