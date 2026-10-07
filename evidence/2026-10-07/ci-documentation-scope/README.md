# Conservative documentation CI scope

Routine CI previously ran every application check for each Markdown progress
update. The foundation job now keeps formatting, repository-relative document
links and its scope tests on documentation changes, while retaining full source
checks for code, migrations, manifests, fixtures, workflow changes and every
unrecognized path.

The smaller path applies only to Markdown under docs/ or evidence/ and only when
the base commit's latest push run of Nest checks has completed successfully.
Missing history, an unknown base, a failed/pending base run or an unavailable
GitHub API keeps full checks. This prevents a documentation push from cancelling
unfinished source verification and then claiming an application check passed.
The foundation check still runs and reports its actual result.

Four focused local cases pass. [Results](focused-tests.log). They exercise the
allowlist and non-Markdown paths, unverified bases, actual Git deletion/rename
detection, missing Git history, document links and CLI output for both verified
and unverified documentation bases. Renames are compared as independent old/new
paths. Broken repository-relative document links fail; external URLs, absolute
device paths and heading anchors are outside this check.

Formatting, scoped lint and diff checks pass. Exact source
`7911bb765b6f9943ba9abffbb5d257200bb91fa6` passes full
[CI 37616655593](https://github.com/drrius/nest/actions/runs/37616655593). Its scope
step, four scope cases, lint/typechecking and all application checks execute and
pass. The foundation job runs from 11:49:04 to 11:52:13 UTC, 189 seconds.

The actual docs-only commit `245a754dd02ccf87457203ec6d93a3e144a5bbbf` passes
[CI 37617123884](https://github.com/drrius/nest/actions/runs/37617123884). Its job
runs from 11:53:14 to 11:53:45 UTC, 31 seconds. Formatting, document scope/link
checks and four scope cases pass. Application lint/typechecks, PostgreSQL journeys
and package tests are explicitly skipped, with the already passing `7911bb76`
source as the base. This confirms actual workflow wiring; it is not a repeated
domain/native test or proof of any open milestone exit.

No native source, backend runtime, migration, dependency, deployment, signing or
phone build changes are included.
