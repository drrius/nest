import { Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import type { RoutineMenuProps } from "./menu-types";

// The live product is iPhone-only. Keep the design preview free of SwiftUI imports.
export function RoutineMenu({ edit, disabled }: RoutineMenuProps) {
  return (
    <>
      <NativeAction label="Edit routine" disabled={disabled} onPress={edit} />
      <Note>Pause, resume and archive are available in the iPhone app.</Note>
    </>
  );
}
