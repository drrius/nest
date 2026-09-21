import * as Picker from "expo-image-picker";
import * as Documents from "expo-document-picker";
import * as Crypto from "expo-crypto";
import { File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import {
  receiptSelection,
  receiptDimensions,
  checkedReceiptBytes,
  ReceiptSelectionFailure,
  type ReceiptFile,
} from "./receipt-selection";
function removeCopy(uri: string) {
  const file = new File(uri),
    root = Paths.cache.uri.endsWith("/") ? Paths.cache.uri : Paths.cache.uri + "/";
  if (!file.uri.startsWith(root)) throw new ReceiptSelectionFailure({ reason: "unavailable" });
  if (file.exists) file.delete();
}
async function readCopy(uri: string, contentType: ReceiptFile["contentType"]) {
  try {
    const file = new File(uri),
      size = file.size;
    if (size === null || size < 12) throw new ReceiptSelectionFailure({ reason: "unsupported" });
    if (size > 4194304) throw new ReceiptSelectionFailure({ reason: "too_large" });
    const bytes = await file.bytes();
    if (bytes.length !== size) throw new ReceiptSelectionFailure({ reason: "unavailable" });
    return checkedReceiptBytes(bytes, contentType);
  } finally {
    removeCopy(uri);
  }
}
async function pickPdf() {
  const result = await Documents.getDocumentAsync({
    type: "application/pdf",
    multiple: false,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) throw new ReceiptSelectionFailure({ reason: "unavailable" });
  return readCopy(asset.uri, "application/pdf");
}
async function pickPhoto() {
  const result = await Picker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: false,
    allowsEditing: false,
    quality: 1,
    exif: false,
    base64: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) throw new ReceiptSelectionFailure({ reason: "unavailable" });
  try {
    return await normalizePhoto(asset);
  } finally {
    removeCopy(asset.uri);
  }
}
async function normalizePhoto(asset: Picker.ImagePickerAsset) {
  const size = receiptDimensions(asset.width, asset.height),
    context = ImageManipulator.manipulate(asset.uri);
  try {
    context.resize(size);
    const image = await context.renderAsync();
    try {
      const saved = await image.saveAsync({
        format: SaveFormat.JPEG,
        compress: 0.85,
        base64: false,
      });
      return await readCopy(saved.uri, "image/jpeg");
    } finally {
      image.release();
    }
  } finally {
    context.release();
  }
}
export const selectNativeReceipt = receiptSelection({
  pick: (kind) => (kind === "photo" ? pickPhoto() : pickPdf()),
  id: () => Crypto.randomUUID(),
  digest: (bytes) =>
    Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new Uint8Array(bytes)).then((value) =>
      Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join(""),
    ),
});
