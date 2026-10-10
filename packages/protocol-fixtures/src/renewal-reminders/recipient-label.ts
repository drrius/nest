export function reminderRecipientLabel(
  member: { actorId: string; displayName: string },
  actorId: string,
) {
  return `${member.actorId === actorId ? "You" : "Partner"} (${member.displayName})`;
}
