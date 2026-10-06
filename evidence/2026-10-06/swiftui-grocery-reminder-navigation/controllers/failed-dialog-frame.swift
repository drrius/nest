import AVFoundation
import AppKit
let source = URL(fileURLWithPath: "/private/tmp/nest-grocery-reminder-native-thumb-20261006/normal_light/attachments/773CA94B-5A1C-4E46-9F2C-ECB04D22ED71.mp4")
let generator = AVAssetImageGenerator(asset: AVURLAsset(url: source))
generator.appliesPreferredTrackTransform = true
let image = try generator.copyCGImage(at: CMTime(seconds: 46, preferredTimescale: 600), actualTime: nil)
let bitmap = NSBitmapImageRep(cgImage: image)
let png = bitmap.representation(using: .png, properties: [:])!
try png.write(to: URL(fileURLWithPath: "/private/tmp/nest-grocery-reminder-native-thumb-20261006/dialog-at-46s.png"))
print("Read-only failure-video frame extracted")
