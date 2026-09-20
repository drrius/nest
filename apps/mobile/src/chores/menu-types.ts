import type { Chore } from "@nest/contracts/chores";
export type ChoreChoice = { chore: Chore; action: "skip" | "reschedule" };
export type ChoreMenuProps = {
  chore: Chore;
  disabled: boolean;
  choose: (choice: ChoreChoice) => void;
};
