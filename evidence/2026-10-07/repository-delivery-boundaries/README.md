# Repository delivery boundaries

Read-only inspection confirms GitHub main f6264642 is unprotected. PR85 remains
OPEN at1c00a089 on codex/swiftui-groceries; that head is an ancestor of the current
SwiftUI branch. More than1,100 subsequent commits exist, mostly source-specific
verification documentation. Old PR checks do not cover the current branch.

GitHub workflows run routine/native verification on push and manual deep checks;
none deploys, migrates production or submits a release. No custom local Git hooks,
repository webhooks or recorded GitHub deployments were found.

[Raw-provider metadata projection](vercel-git-links.json) covers all six current
Vercel team projects, with no next page. None is Git-linked to drrius/nest. The
nest-test-api project has no Git link and uses apps/api; household-os and
household-payroll are linked to their separate repositories. No project or Git
settings changed, environment values or deploy-hook URLs were exported, or
production endpoint was called. Supabase Git automation still needs its own check.

The owner authorized local merge/direct-main delivery and later waived extra Sol
verification. Latest-source CI and direct verification remain necessary. No merge
or main update is performed by this audit, and production migration, purchases,
public publication and new tester invitations remain separately gated.
