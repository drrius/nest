// Only the caller-owned disposable integration database is modified.
export function suspendLegacyApproval(db, kind) {
  const context = kind === "adoption" ? "adoption_approval_context" : `${kind}_context`;
  db.sql(`revoke execute on function public.nest_decide_legacy_${kind}(uuid,uuid,jsonb,uuid,boolean),
    public.nest_execute_legacy_${kind}(uuid,uuid,jsonb,uuid),
    public.nest_read_legacy_${context}(uuid,uuid) from public,anon,authenticated,service_role`);
}
