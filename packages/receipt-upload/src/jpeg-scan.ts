import { invalid, type Frame } from "./jpeg-types.ts";
export function scanComponents(bytes: Uint8Array, offset: number, length: number, frame: Frame) {
  const count = bytes[offset + 2]!;
  if (count < 1 || count > 4 || length !== 6 + count * 2) return invalid();
  const selected = new Set<number>();
  for (let index = 0; index < count; index++) {
    const id = bytes[offset + 3 + index * 2]!;
    if (!frame.components.has(id) || selected.has(id)) return invalid();
    selected.add(id);
  }
  return selected;
}
export function expectedRestarts(frame: Frame, selected: Set<number>, interval: number) {
  if (!interval) return 0;
  let mcus: number;
  if (selected.size === 1) {
    const component = frame.components.get([...selected][0]!)!;
    mcus =
      Math.ceil((Math.ceil(frame.width / 8) * component.horizontal) / frame.maxHorizontal) *
      Math.ceil((Math.ceil(frame.height / 8) * component.vertical) / frame.maxVertical);
  } else {
    mcus =
      Math.ceil(frame.width / (8 * frame.maxHorizontal)) *
      Math.ceil(frame.height / (8 * frame.maxVertical));
  }
  return Math.floor((mcus - 1) / interval);
}
export function scanEnd(bytes: Uint8Array, offset: number, restarts: number) {
  let found = 0,
    entropy = false;
  while (offset < bytes.length - 1) {
    if (bytes[offset] !== 255) {
      entropy = true;
      offset++;
      continue;
    }
    const markerStart = offset++;
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset];
    if (marker === 0) {
      entropy = true;
      offset++;
      continue;
    }
    if (isRestart(marker)) {
      if (marker !== 0xd0 + (found % 8)) return invalid();
      found++;
      offset++;
      continue;
    }
    if (!entropy || found !== restarts) return invalid();
    return markerStart;
  }
  return invalid();
}

function isRestart(marker: number | undefined) {
  return marker !== undefined && marker >= 0xd0 && marker <= 0xd7;
}
