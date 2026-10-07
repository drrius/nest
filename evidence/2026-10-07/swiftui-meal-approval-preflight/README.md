# Online meal approval staging

New native meal-plan approvals previously created a durable intent directly from
a cached preview. Staging now first obtains the current authenticated private
preview and requires exact equality, ready status and an unexpired deadline.
Account generation is checked after authentication and after the network read.
Offline, edited or expired previews cannot create an approval journal. Existing
pending approvals keep their original exact retry/recovery path.

Two focused signed-app XCTest methods pass without skips on the isolated unit-test
simulator. Three refused preflight cases preserve the original cached preview,
leave the actual SQLite approval journal empty and send no approval command.
The lost-reply case still reuses exactly the same operation, receives its original
recorded result and clears the journal after reconciliation. The controlled server
now correctly returns ready before an approval and approved afterward.

Strict Swift formatting, source limits and diff checks pass. No hosted proposal,
provider call, meal write or preserved QA-client mutation occurs. The isolated
simulator is shut down afterward. These tests prove the native session/SQLite
boundary, not live AI, rendered approval or phone acceptance. Current-change CI
remains required; the existing stable-source CI jobs are allowed to finish before
pushing this next shipping change.
