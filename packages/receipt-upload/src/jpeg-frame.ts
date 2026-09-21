import { invalid, word, type Frame, type Component } from "./jpeg-types.ts";
function dimensions(bytes: Uint8Array, offset: number, length: number) {
  if (length < 11 || bytes[offset + 2] !== 8) return invalid();
  const height = word(bytes, offset + 3),
    width = word(bytes, offset + 5),
    count = bytes[offset + 7]!;
  if (
    !width ||
    !height ||
    width > 2000 ||
    height > 2000 ||
    ![1, 3, 4].includes(count) ||
    length !== 8 + count * 3
  )
    return invalid();
  return { width, height, count };
}
function component(bytes: Uint8Array, start: number) {
  const id = bytes[start]!,
    horizontal = bytes[start + 1]! >> 4,
    vertical = bytes[start + 1]! & 15;
  if (!horizontal || horizontal > 4 || !vertical || vertical > 4) return invalid();
  return { id, horizontal, vertical };
}
export function readFrame(bytes: Uint8Array, offset: number, length: number): Frame {
  const { width, height, count } = dimensions(bytes, offset, length),
    components = new Map<number, Component>();
  let maxHorizontal = 0,
    maxVertical = 0,
    blocks = 0;
  for (let index = 0; index < count; index++) {
    const { id, horizontal, vertical } = component(bytes, offset + 8 + index * 3);
    if (components.has(id)) return invalid();
    components.set(id, { horizontal, vertical });
    maxHorizontal = Math.max(maxHorizontal, horizontal);
    maxVertical = Math.max(maxVertical, vertical);
    blocks += horizontal * vertical;
  }
  if (blocks > 10) return invalid();
  return { width, height, components, maxHorizontal, maxVertical };
}
