// Server-only receipt inspection; audited from Household OS 4a528c96.
import jpeg from "jpeg-js";
import { receiptByteLimit } from "./bytes.ts";
import { jpegStructure } from "./jpeg-structure.ts";
export const JPEG_DECODE_LIMITS = {
  useTArray: true as const,
  formatAsRGBA: false,
  tolerantDecoding: false,
  maxResolutionInMP: 4,
  maxMemoryUsageInMB: 96,
};
type Decoder = (
  bytes: Uint8Array,
  options: typeof JPEG_DECODE_LIMITS,
) => {
  width: number;
  height: number;
  data: Uint8Array;
};

export function inspectAttachment(bytes: Uint8Array, decode: Decoder = jpeg.decode) {
  if (bytes.length < 12 || bytes.length > receiptByteLimit) return null;
  if ([37, 80, 68, 70, 45].every((byte, index) => bytes[index] === byte))
    return { extension: "pdf", mime: "application/pdf" };
  try {
    const frame = jpegStructure(bytes);
    const image = decode(bytes, JPEG_DECODE_LIMITS);
    if (
      image.width !== frame.width ||
      image.height !== frame.height ||
      image.data.byteLength !== frame.width * frame.height * 3
    )
      return null;
    return { extension: "jpg", mime: "image/jpeg" };
  } catch {
    return null;
  }
}
