// Generates one reviewed conversion transaction; never opens a database connection.
export function renewalConversionSql({ householdId, commitmentId, operationId, sourceHash }) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  if (
    ![householdId, commitmentId, operationId].every(
      (value) => typeof value === "string" && uuid.test(value),
    ) ||
    typeof sourceHash !== "string" ||
    !/^[0-9a-f]{64}$/.test(sourceHash)
  )
    throw new Error("Invalid reviewed conversion identity");
  return `select public.nest_convert_legacy_renewal('${householdId}','${commitmentId}','${operationId}','${sourceHash}');`;
}
