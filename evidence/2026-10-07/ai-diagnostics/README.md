# Private AI diagnostics

The existing request/Supabase diagnostics are extended to SDK generation, model
and registered-tool spans. Per-call integrations replace global integrations and
explicitly disable input/output recording. Exported fields are fixed operation,
configured model name, registered tool name, outcome and timing, correlated to the
request/trace. Prompts, private memory, chat, tool arguments/results, calendar and
financial contents, and raw provider errors are excluded.

Four focused tests drive the actual pinned AI SDK with in-process test models,
including a streamed tool call, structured generation, provider failure and
cancellation. All pass. The worker additionally reports14focused SDK/assistant/
meal-boundary checks passing, API/AI typechecks, API build, scoped lint and format.
These are SDK orchestration checks, not live provider acceptance. No model credit,
paid collector, new service or provider request is used. Existing budgets,
approvals, domain authorization and cancellation rules remain intact.

The native privacy manifest declares performance/other diagnostic data for app
functionality without tracking. Linked=true conservatively covers reports shared
by an identified owner. Other nine declarations are preserved. See Apple's
[data collection guidance](https://developer.apple.com/documentation/technotes/tn3184-adding-data-collection-details-to-your-privacy-manifest).
Public Store privacy metadata remains part of the gated public-release work.

Native CI now uses sparse checkout of apps/ios and scripts, preserving every
existing check. Prior measurements: routine269s, docs-only167s with148s checkout,
SwiftUI553–710s with405–519s app testing. Most repository size is retained evidence
446.6MiB across16,193files. The [checkout implementation](https://github.com/actions/checkout/blob/v4/src/git-source-provider.ts)
automatically uses blob filtering with sparse paths. Build/test dependencies are
within those two directories. No routine financial/security gate is removed.
New CI savings are not claimed until a measured run finishes.
