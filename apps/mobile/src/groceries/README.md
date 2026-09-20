# Native grocery checking

The authenticated Today screen links to `/checklist`. Native checkbox controls load real authorized groceries through the API; quantities/units are displayed, pending operations survive SQLite restart and conflicts require explicit discard before a fresh action. Compatible check/uncheck chains retain original operation UUIDs and predecessor receipt versions. Confirmed auth loss blocks checking; later availability failures do not clear that denial. The root account store is shared with chores, and each snapshot replaces only its own feature data.

Eleven local transport/controller/SQLite tests plus a real HTTP/PostgREST/PostgreSQL restart journey pass. The latter includes a lost committed response, partner convergence, concurrent description conflict and membership revocation. Node SQLite and synthetic Auth remain fixture boundaries, not an iPhone test.

Still required: online add/edit/remove forms with stable retry handling, category presentation, automatic reconnect retry, cold-start offline identity recovery, journal retention and physical-device verification. No purchase or expense is created by checking; receipt/expense entry remains a separate future Money action. This screen is not the completed groceries milestone.

## Prepared device smoke (not executed)

On two test iPhones connected to the isolated backend, load the same checklist. Check offline, uncheck again, kill/reopen after approved offline identity recovery is available, then reconnect. Verify final state and one receipt per operation. Drop an acknowledgment after commit; confirm exact retry. Let the partner check the same item and edit another item's description; verify compatible convergence versus a visible conflict. Move repeatedly between Today and groceries while replay is active; verify neither invalidates the other's lease. Confirm logout/account change hides the prior household and preserves its pending work for the same identity. Verify haptics, VoiceOver, large text, dark mode and Reduce Motion on the actual build.
