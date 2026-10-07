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

Formatting, scoped lint and diff checks pass. The workflow change itself requires
full source CI; no application checks have been skipped for it. Actual GitHub
execution of the shorter documentation path remains to be observed after this
source has passed. No native source, backend runtime, migration, dependency,
deployment, signing or phone build changes are included.
