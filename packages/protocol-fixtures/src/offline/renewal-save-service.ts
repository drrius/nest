import * as Renewals from "./renewal-saves.ts";
import type { RenewalSaveAttempt } from "../renewals/save-attempt.ts";
import type { Database } from "./database.ts";
import type { Session } from "./contracts.ts";
import { run } from "./run.ts";
export function renewalSaveStore(database: Database) {
  return {
    readRenewalSave: (session: Session) => run(() => Renewals.readRenewalSave(database, session)),
    stageRenewalSave: (session: Session, attempt: RenewalSaveAttempt, current: () => boolean) =>
      run(() => Renewals.stageRenewalSave(database, session, attempt, current)),
    clearRenewalSave: (session: Session, attempt: RenewalSaveAttempt) =>
      run(() => Renewals.clearRenewalSave(database, session, attempt)),
  };
}
