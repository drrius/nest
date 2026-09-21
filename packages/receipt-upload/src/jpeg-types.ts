export type Component = { horizontal: number; vertical: number };
export type Frame = {
  width: number;
  height: number;
  components: Map<number, Component>;
  maxHorizontal: number;
  maxVertical: number;
};
export function invalid(): never {
  throw new Error("Invalid or unsupported JPEG");
}
export function word(bytes: Uint8Array, offset: number) {
  if (offset + 1 >= bytes.length) return invalid();
  return bytes[offset]! * 256 + bytes[offset + 1]!;
}
