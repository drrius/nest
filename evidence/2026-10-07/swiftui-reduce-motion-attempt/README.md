# Reduce Motion Settings attempt

The guarded signed simulator UI test is implemented and compiles. Actual Reduce
Motion navigation is not verified. Three bounded attempts are retained; none pass.
The first expects a Settings cell and cannot find Accessibility. The corrected
lookup reaches Accessibility, Motion and the real REDUCE_MOTION switch, but its
immediate enabled-value assertion sees zero. The final observer waits ten seconds
for value one and still fails before launching Nest. No animation or navigation
acceptance is inferred. Further unchanged-setting retries are stopped.

The test protects restoration before tapping the switch, then waits for the original
value. The final result contains only the enabling timeout, with no restoration
assertion failure. The original setting was zero at the attempted tap. The runner
also restores original member scopes,64 empty journals, display appearance/text
and local privacy choices after each attempt. Those scopes are separate from the
Settings value check. No hosted command, provider call or Calendar permission
change occurs.

This is an unresolved simulator Settings interaction, not evidence that Nest
ignores Reduce Motion. Actual device setting/navigation/motion review remains in
M1 acceptance. The manual test stays explicitly guarded and absent from routine
execution; CI compiles it but cannot establish the missing behavior.
