# Native variable-bill cancellation restart

Two selected signed native model tests pass with zero failures or skips. They
use the actual SessionModel and SQLite journal with fake authentication and
controlled HTTP transport. They create no hosted rule, expense, cycle or approval.

A lost cancellation reply preserves the original command and cancellation flag
through reopening the SQLite store. Retry returns cancelled with zero Save calls.
After a committed Save reply is lost, cancellation instead returns the same recorded
bill receipt, with one Save call total. Both cases clear the exact terminal request
only through finish. The cancellation endpoint receives only the original operation
ID; receipt reads and Save bind the original command identity.

[Results](result.json) record two passes. The [initial result](initial-result.json)
retains two failures caused by a fixture decoder expecting a full command instead
of the client protocol's operation-only cancellation. Correcting that fixture did
not change shipping code or weaken the assertions. [Source](source.json) identifies
the formatted test file.

Both original simulator actors/household, 64 empty journals, display settings and
local privacy choices restore. [Restoration](restoration.json). Swift source limits,
signed compilation and focused execution pass. Current-source CI is not yet run
for this new test. These results do not establish actual server cancellation,
hosted lost cancellation replies, the rendered confirmation dialog, physical
phones or full M7 acceptance.
