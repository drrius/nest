import { invalid, word, type Frame } from "./jpeg-types.ts";
import { readFrame } from "./jpeg-frame.ts";
import { scanComponents, expectedRestarts, scanEnd } from "./jpeg-scan.ts";
interface State {
  offset: number;
  interval: number;
  scans: number;
  frame: Frame | null;
  scanned: Set<number>;
}
function nextMarker(bytes: Uint8Array, state: State) {
  if (bytes[state.offset++] !== 255) return invalid();
  while (bytes[state.offset] === 255) state.offset++;
  const marker = bytes[state.offset++];
  if (marker === undefined) return invalid();
  return marker;
}
function segmentLength(bytes: Uint8Array, state: State, marker: number) {
  if (
    !(
      [0xc0, 0xc1, 0xc2, 0xc4, 0xdb, 0xdd, 0xda, 0xfe].includes(marker) ||
      (marker >= 0xe0 && marker <= 0xef)
    )
  )
    return invalid();
  const length = word(bytes, state.offset);
  if (length < 2 || state.offset + length > bytes.length) return invalid();
  return length;
}
function finish(bytes: Uint8Array, state: State): Frame {
  if (
    state.offset !== bytes.length ||
    !state.frame ||
    !state.scans ||
    state.scanned.size !== state.frame.components.size
  )
    return invalid();
  return state.frame;
}
function scan(bytes: Uint8Array, state: State, length: number) {
  if (!state.frame || ++state.scans > 64) return invalid();
  const selected = scanComponents(bytes, state.offset, length, state.frame);
  for (const id of selected) state.scanned.add(id);
  state.offset = scanEnd(
    bytes,
    state.offset + length,
    expectedRestarts(state.frame, selected, state.interval),
  );
}
function segment(bytes: Uint8Array, state: State, marker: number) {
  const length = segmentLength(bytes, state, marker);
  if ([0xc0, 0xc1, 0xc2].includes(marker)) {
    if (state.frame) return invalid();
    state.frame = readFrame(bytes, state.offset, length);
  } else if (marker === 0xdd) {
    if (length !== 4) return invalid();
    state.interval = word(bytes, state.offset + 2);
  } else if (marker === 0xda) {
    scan(bytes, state, length);
    return;
  }
  state.offset += length;
}
export function jpegStructure(bytes: Uint8Array): Frame {
  if (word(bytes, 0) !== 0xffd8) return invalid();
  const state: State = { offset: 2, interval: 0, scans: 0, frame: null, scanned: new Set() };
  while (state.offset < bytes.length) {
    const marker = nextMarker(bytes, state);
    if (marker === 0xd9) return finish(bytes, state);
    segment(bytes, state, marker);
  }
  return invalid();
}
