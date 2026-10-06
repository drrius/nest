# Swift test source-limit gap

The checker enforces 400-line files in all Swift directories, but returns before
checking function length or complexity in `Tests` and `AppTests`. Fifteen existing
functions exceed complexity 10; none exceeds 80 code lines.
[Census](before-census.json) records paths, positions and measurements at source
`a5ce9ec7`. Shipping source and UI tests remain covered by the existing checker.

The new focused tooling regression uses temporary Swift files outside the
repository. It checks all four source roles. Before a checker fix, the file-limit
case passes and the function-length and complexity cases fail for test roles.
[Actual before-fix output](before-tests.txt). No native build or hosted request is
part of this scanner reproduction.

The exemption is removed. Existing fixture response, pause, recovery and
configuration blocks are split into small helpers, preserving guards, assertion
coverage, error handling and mutation order. Shipping source is unchanged.
[After census](after-census.json) records every affected file within all limits.
The focused regression now passes all three cases, and the complete tooling
suite passes 14 cases with zero failures or skips.
[Regression](after-tests.txt), [tooling](tooling-tests.txt).

The 15 Swift files were formatted with the repository configuration in a separate
Mac directory. Global Swift source limits pass without a test exemption. Native
compilation and the affected financial, session and offline behavior tests remain
pending; scanner results do not substitute for them.
