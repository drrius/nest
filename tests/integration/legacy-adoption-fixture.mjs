import { fixture as legacy, id, run } from "./legacy-dismissal-fixture.mjs";
export { id, run };
export async function fixture(t) {
  const f = await legacy(t, [
    "supabase/migrations/20260922033013_native_legacy_recurring_fences.sql",
    "supabase/migrations/20260922034111_native_legacy_adoption_context.sql",
    "supabase/migrations/20260922192907_native_legacy_adoption_command.sql",
  ]);
  await run(f.native.saveLegacyDismissal(f.command));
  const context = await run(f.native.legacyAdoptionContext(id(800)));
  const command = {
    operationId: id(850),
    input: {
      ruleId: id(800),
      reviewToken: context.reviewToken,
      configuration: {
        ...f.rule.configuration,
        mode: "fixed",
        amountCentimes: "101",
        allocations: [
          { memberId: id(1), centimes: "51" },
          { memberId: id(2), centimes: "50" },
        ],
        note: "Explicit future mandate. ".repeat(130),
      },
      firstDueOn: f.rule.firstDueOn,
    },
  };
  return { ...f, command, context };
}
