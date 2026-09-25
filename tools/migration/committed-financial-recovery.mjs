import {
  seedRecurringApprovalRecovery,
  verifyRecurringApprovalRecovery,
} from "./recurring-approval-recovery.mjs";
import {
  seedAdjustmentApprovalRecovery,
  verifyAdjustmentApprovalRecovery,
} from "./adjustment-approval-recovery.mjs";
import {
  seedSettlementApprovalRecovery,
  verifySettlementApprovalRecovery,
} from "./settlement-approval-recovery.mjs";
import { seedOfflineReceipts, verifyFrozenOfflineReceipts } from "./offline-receipt-rehearsal.mjs";
import { assertLegacyJobsPausedSql } from "./legacy-job-pause-rehearsal.mjs";
import assert from "node:assert/strict";
import { as, id, save } from "../../tests/database/native-expense-helpers.mjs";
import { captureRehearsal, compareRehearsal } from "./financial-rehearsal.mjs";
import { freezeRecoveryFixture } from "./committed-recovery-freeze.mjs";
import { seedApprovalRecovery, verifyApprovalRecovery } from "./approval-recovery-rehearsal.mjs";
import { seedRecurringRecovery, verifyRecurringRecovery } from "./recurring-recovery-rehearsal.mjs";
import {
  seedRecoveryAdjustments,
  verifyRecoveryAdjustments,
} from "./adjustment-recovery-rehearsal.mjs";
import {
  seedRecoverySettlement,
  verifyRecoverySettlement,
} from "./settlement-recovery-rehearsal.mjs";

// Last fixture step: commit new history, then restrict APIs without restoring old data.
// The caller owns a disposable cluster and destroys it after the report.
export function verifyCommittedFinancialRecovery(db) {
  const offlineReceipts = seedOfflineReceipts(db);
  const original = captureRehearsal(db);
  const receipt = JSON.parse(db.sql(as(1, save(1700))));
  const settlement = seedRecoverySettlement(db);
  const adjustments = seedRecoveryAdjustments(db);
  const recurringApprovals = seedRecurringApprovalRecovery(db);
  const recurring = seedRecurringRecovery(db);
  const approvals = seedApprovalRecovery(db);
  const settlementApprovals = seedSettlementApprovalRecovery(db);
  const adjustmentApprovals = seedAdjustmentApprovalRecovery(db);
  const committed = captureRehearsal(db);
  assert.equal(
    committed.financial.tables.financial_events.length,
    original.financial.tables.financial_events.length + 22,
  );
  const reads = readFinancialState(db, receipt.eventId);
  for (const read of reads)
    assert.equal(
      read.history.events.some((event) => event.eventId === receipt.eventId),
      true,
    );
  freezeRecoveryFixture(db);
  db.sql(assertLegacyJobsPausedSql());
  assert.throws(
    () => db.sql(as(1, save(1701))),
    /permission denied for function nest_save_expense/,
  );
  assert.deepEqual(readFinancialState(db, receipt.eventId), reads);
  const recovered = JSON.parse(
    db.sql(as(1, `select public.nest_read_expense_save('${id(10)}','${id(1700)}')`)),
  );
  assert.equal(recovered.status, "recorded");
  assert.deepEqual(recovered.receipt, receipt);
  const recovery = {
    recurringApprovalRecovery: verifyRecurringApprovalRecovery(db, recurringApprovals),
    adjustmentApprovalRecovery: verifyAdjustmentApprovalRecovery(db, adjustmentApprovals),
    approvalRecovery: verifyApprovalRecovery(db, approvals),
    settlementApprovalRecovery: verifySettlementApprovalRecovery(db, settlementApprovals),
    recurringRecovery: verifyRecurringRecovery(db, recurring),
    adjustmentRecovery: verifyRecoveryAdjustments(db, adjustments),
    settlementRecovery: verifyRecoverySettlement(db, settlement),
    offlineReceiptRecovery: verifyFrozenOfflineReceipts(db, offlineReceipts),
  };
  assert.equal(compareRehearsal(committed, captureRehearsal(db)).passed, true);
  assert.throws(
    () => db.sql(as(3, `select public.nest_money_history('${id(10)}')`)),
    /Not authorized/,
  );
  return {
    ...recovery,
    committedExpensePreserved: true,
    financialReadsPreserved: true,
    receiptRecoveryPreserved: true,
    financialDetailPreserved: true,
    newExpenseRefused: true,
    outsiderDenied: true,
    restoredOldDatabase: false,
    nativeAutomaticPostingPaused: true,
    existingHouseholdTableWritesFrozen: true,
    knownLegacyEntryPointsPaused: 8,
    externalRequestsDrained: false,
    ownerJobsStopped: false,
    completeRecovery: false,
  };
}

function readFinancialState(db, eventId) {
  assert.throws(
    () => db.sql(as(3, `select public.nest_money_detail('${id(10)}','${eventId}')`)),
    /Not authorized/,
  );
  return [1, 2].map((actor) =>
    JSON.parse(
      db.sql(
        as(
          actor,
          `select jsonb_build_object('balance',public.nest_money_balance('${id(10)}'),
      'history',public.nest_money_history('${id(10)}'),
      'detail',public.nest_money_detail('${id(10)}','${eventId}'))`,
        ),
      ),
    ),
  );
}
