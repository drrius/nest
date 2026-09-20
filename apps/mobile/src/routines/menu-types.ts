export type RoutineMenuProps = {
  title: string;
  paused: boolean;
  disabled: boolean;
  edit: () => void;
  changeState: (action: "pause" | "resume" | "archive") => void;
};
