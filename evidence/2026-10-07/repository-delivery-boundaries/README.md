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
production endpoint was called. [Supabase branch metadata](supabase-branches.json)
shows no test branches and one legacy default main branch. It does not expose
the repository or production auto-deploy setting. The owner configuration
question is pending; a remote main push remains gated on that setting.

The owner authorized local merge/direct-main delivery and later waived extra Sol
verification. Latest-source CI and direct verification remain necessary. No merge
or main update is performed by this audit, and production migration, purchases,
public publication and new tester invitations remain separately gated.

Supabase documents production Git auto-deployment as an opt-in integration setting.
The existing connector does not expose the
[organization GitHub connections endpoint](https://supabase.com/docs/reference/api/v2-list-organization-github-connections),
and no CLI management login is available. No new credential, token, connection or
production setting was created to fill this read-only gap.
