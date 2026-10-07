# Isolated native keyboard-toolbar diagnosis

`Probe.swift` is a standalone diagnostic app, not a shipping client or substitute
for Nest verification. It contains only a native TabView, NavigationStack, Form,
TextField and keyboard ToolbarItemGroup with Spacer/Review. A task focuses the
field and dismisses it. It has no network, authentication, persistence or domain
code. A separate empty owned SE3 simulator runs the compiled signed app on
iOS26.3.1 and is deleted afterward. Original Nest simulators remain untouched.

The captured process log reports one invalid-frame warning. Its three leading
UUID/offset pairs exactly match the five Nest warning stacks, resolving to
SwiftUICore's fixed-frame initializer called by SwiftUI InputAccessoryBar.body.
This proves Nest's data and domain code are unnecessary to reproduce the warning.
It does not establish behavior on a physical phone or every iOS version, nor does
it clear usability or accessibility findings. No warnings are suppressed.

A no-toolbar control uses the same field/focus/dismissal sequence and reports zero
warnings. Its separate simulator is also deleted, with originals untouched.
`Control.swift`, `control-result.json` and `control-cleanup.json` record that run.
The warning follows the standard native keyboard ToolbarItemGroup on this runtime.
Removing Nest's useful keyboard controls would remove the trigger but would not
fix the underlying framework sizing behavior. The shipping controls remain intact;
hardware keyboard/accessibility acceptance stays open. No palette or financial
layout change is justified by these stacks.
