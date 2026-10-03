# Actual hosted grocery concurrency and isolation

Seven bounded cases passed on3 October against the existing stable nest-test API, backend source `83a5a015`, Supabase project `tkjixmujjoustdiedfmw` and fictional household `be772ffd-3ab5-41d5-8438-647a79a553da`.

1. Two real member requests checked the same initial item concurrently. One applied, the other returned already_applied; both received version2. Exact replay returned identical receipts without another version change. Reusing an operation with a changed payload returned400.
2. Direct authenticated PostgREST reads of the operation receipt table exposed only each member's own receipt; the outsider saw zero rows.
3. After a partner checked then unchecked another item, a stale opposing check returned409 on both attempts. Both members continued to see the canonical unchecked version3.
4. A partner removed a third item through the normal command. A stale check returned410; the item was absent for both members.
5. Outsider and anonymous mutations returned403/401 without changing state. Direct outsider grocery table reads returned no fixture rows.
6. Both members' complete balance responses were identical before and after all checklist changes, including event counts14. No financial writes were sent.
7. All three newly created fictional fixtures were removed through normal versioned commands; no active fixture rows remain. Removed records and operation receipts were retained.

The recorded runner uses existing independent fictional account credentials from private `/tmp` files; it never prints or stores them in this evidence. It uses only a publishable key for direct RLS probes, not a server key. Stable operation/item identities are written before mutations, and an existing run directory blocks blind restarts.

This is real hosted API/PostgREST evidence, not native rendering, an airplane-mode test, a process-restart test or live AI execution. The Mac briefly responded and then Tailscale reported it offline. The intended visible native outage/restart/replay journey remains pending; no relay/certificate/app configuration was installed while SSH was unavailable. No production data, schema, provider configuration or new beta changed.
