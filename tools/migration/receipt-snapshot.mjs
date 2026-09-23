// Metadata reconciliation only: actual object bytes and access need Storage verification.
export function captureReceiptSnapshot(sql) {
  const snapshot = JSON.parse(
    sql(`select jsonb_build_object(
    'version', 1,
    'completeVisibility', (select rolsuper or rolbypassrls from pg_roles where rolname=current_user),
    'references', (select coalesce(jsonb_agg(jsonb_build_object(
      'eventId', e.id,
      'digest', encode(sha256(convert_to(jsonb_build_object(
        'household', e.household_id, 'path', e.receipt_path,
        'upload', to_jsonb(u), 'object', to_jsonb(o), 'bucket', to_jsonb(b)
      )::text, 'UTF8')), 'hex'),
      'valid', coalesce(u.household_id=e.household_id and u.state='claimed'
        and o.id is not null and b.public=false
        and split_part(e.receipt_path,'/',1)=e.household_id::text, false)
      ) order by e.id), '[]')
      from public.financial_events e
      left join public.household_attachment_uploads u on u.path=e.receipt_path
      left join storage.objects o on o.bucket_id='household-files' and o.name=e.receipt_path
      left join storage.buckets b on b.id=o.bucket_id
      where e.receipt_path is not null)
  )`),
  );
  if (snapshot.completeVisibility !== true)
    throw new Error("Receipt reconciliation requires complete RLS visibility");
  return snapshot;
}
export function reconcileReceiptSnapshots(before, after) {
  if (![before, after].every((s) => s?.version === 1 && s.completeVisibility === true))
    return { passed: false, reason: "incomplete-snapshot" };
  if (![before, after].every((s) => s.references.every((row) => row.valid === true)))
    return { passed: false, reason: "invalid-receipt-reference" };
  if (JSON.stringify(before.references) !== JSON.stringify(after.references))
    return { passed: false, reason: "changed-receipt-reference" };
  return { passed: true, reason: null };
}
