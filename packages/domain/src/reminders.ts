export type ReminderRecipients = "me" | "partner" | "both";
export interface ReminderMember {
  id: string;
  itemRemindersEnabled: boolean;
}
export function reminderRecipients(
  sender: string,
  choice: ReminderRecipients,
  members: readonly ReminderMember[],
  personalOwner: string | null = null,
): readonly string[] {
  if (members.length !== 2 || new Set(members.map((member) => member.id)).size !== 2) return [];
  if (!members.some((member) => member.id === sender)) return [];
  if (personalOwner !== null && personalOwner !== sender) return [];
  return members
    .filter((member) => {
      if (!member.itemRemindersEnabled) return false;
      if (personalOwner !== null && member.id !== personalOwner) return false;
      if (choice === "me") return member.id === sender;
      if (choice === "partner") return member.id !== sender;
      return choice === "both";
    })
    .map((member) => member.id)
    .sort();
}
export interface ReminderIdentity {
  householdId: string;
  recipientId: string;
  itemKind: string;
  itemId: string;
  scheduleRevision: string;
  occurrence: string;
}
export function reminderIdentity(value: ReminderIdentity): string {
  return JSON.stringify([
    value.householdId,
    value.recipientId,
    value.itemKind,
    value.itemId,
    value.scheduleRevision,
    value.occurrence,
  ]);
}
export interface ReminderCurrentState {
  itemRevision: string;
  scheduleRevision: string;
  active: boolean;
  recipientEnabled: boolean;
}
export function reminderIsCurrent(
  scheduled: { itemRevision: string; scheduleRevision: string },
  current: ReminderCurrentState,
): boolean {
  return (
    current.active &&
    current.recipientEnabled &&
    scheduled.itemRevision === current.itemRevision &&
    scheduled.scheduleRevision === current.scheduleRevision
  );
}
