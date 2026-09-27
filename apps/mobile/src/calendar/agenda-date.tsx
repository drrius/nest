import { Note } from "../components/page";
import type { AgendaView } from "./agenda-runtime";

export function AgendaDate({ view }: { view: AgendaView }) {
  return <Note>{view.date}</Note>;
}
