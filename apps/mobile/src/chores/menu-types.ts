import type { Chore } from "@nest/contracts/chores";
export type ChoreChoice = { chore: Chore; action: "skip" | "reschedule" | "transfer" };
export type ChoreMenuProps = {
  chore: Chore;
  disabled: boolean;
  canTransfer: boolean;
  choose: (choice: ChoreChoice) => void;
};
