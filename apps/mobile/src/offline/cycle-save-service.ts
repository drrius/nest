import * as LegacyConfirmations from "./legacy-confirmation-saves.ts";
import type { LegacyConfirmationSaveAttempt } from "../money/legacy-confirmation-save-attempt.ts";
import * as LegacyDismissals from "./legacy-dismissal-saves.ts";
import type { LegacyDismissalSaveAttempt } from "../money/legacy-dismissal-save-attempt.ts";
import * as VariableCycleSaves from "./variable-cycle-saves.ts";
import type { VariableCycleSaveAttempt } from "../money/recurring-variable-save-attempt.ts";
import * as ManualCycleSaves from "./manual-cycle-saves.ts";
import type { ManualCycleSaveAttempt } from "../money/recurring-manual-save-attempt.ts";
import type { Database } from "./database.ts";
import type { Session } from "./contracts.ts";
import { run } from "./run.ts";
function variableCycleSaveStore(database: Database) {
  return {
    readVariableCycleSave: (session: Session) =>
      run(() => VariableCycleSaves.readVariableCycleSave(database, session)),
    stageVariableCycleSave: (
      session: Session,
      attempt: VariableCycleSaveAttempt,
      current: () => boolean,
    ) => run(() => VariableCycleSaves.stageVariableCycleSave(database, session, attempt, current)),
    clearVariableCycleSave: (session: Session, attempt: VariableCycleSaveAttempt) =>
      run(() => VariableCycleSaves.clearVariableCycleSave(database, session, attempt)),
  };
}
function manualCycleSaveStore(database: Database) {
  return {
    readManualCycleSave: (session: Session) =>
      run(() => ManualCycleSaves.readManualCycleSave(database, session)),
    stageManualCycleSave: (
      session: Session,
      attempt: ManualCycleSaveAttempt,
      current: () => boolean,
    ) => run(() => ManualCycleSaves.stageManualCycleSave(database, session, attempt, current)),
    clearManualCycleSave: (session: Session, attempt: ManualCycleSaveAttempt) =>
      run(() => ManualCycleSaves.clearManualCycleSave(database, session, attempt)),
  };
}

export function cycleSaveStore(database: Database) {
  return {
    ...variableCycleSaveStore(database),
    ...manualCycleSaveStore(database),
    ...legacyDismissalStore(database),
    ...legacyConfirmationStore(database),
  };
}

function legacyDismissalStore(database: Database) {
  return {
    readLegacyDismissalSave: (session: Session) =>
      run(() => LegacyDismissals.readLegacyDismissalSave(database, session)),
    stageLegacyDismissalSave: (
      session: Session,
      attempt: LegacyDismissalSaveAttempt,
      current: () => boolean,
    ) => run(() => LegacyDismissals.stageLegacyDismissalSave(database, session, attempt, current)),
    clearLegacyDismissalSave: (session: Session, attempt: LegacyDismissalSaveAttempt) =>
      run(() => LegacyDismissals.clearLegacyDismissalSave(database, session, attempt)),
  };
}

function legacyConfirmationStore(database: Database) {
  return {
    readLegacyConfirmationSave: (session: Session) =>
      run(() => LegacyConfirmations.readLegacyConfirmationSave(database, session)),
    stageLegacyConfirmationSave: (
      session: Session,
      attempt: LegacyConfirmationSaveAttempt,
      current: () => boolean,
    ) =>
      run(() =>
        LegacyConfirmations.stageLegacyConfirmationSave(database, session, attempt, current),
      ),
    clearLegacyConfirmationSave: (session: Session, attempt: LegacyConfirmationSaveAttempt) =>
      run(() => LegacyConfirmations.clearLegacyConfirmationSave(database, session, attempt)),
  };
}
