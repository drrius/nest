export type MenuAction = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
};
export type ActionMenuProps = {
  label: string;
  actions: readonly MenuAction[];
};
