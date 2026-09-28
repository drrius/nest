import ImageIO
import UIKit

/// Decode pixels and encode a new JPEG rather than forwarding photo metadata.
enum ReceiptMedia {
    static func photo(_ data: Data) throws -> Data {
        guard data.count <= 50_000_000,
            let source = CGImageSourceCreateWithData(data as CFData, nil),
            let image = CGImageSourceCreateThumbnailAtIndex(
                source, 0,
                [
                    kCGImageSourceCreateThumbnailFromImageAlways: true,
                    kCGImageSourceCreateThumbnailWithTransform: true,
                    kCGImageSourceThumbnailMaxPixelSize: 2000,
                    kCGImageSourceShouldCacheImmediately: true,
                ] as CFDictionary)
        else { throw NestAPIFailure.invalid }
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let size = CGSize(width: image.width, height: image.height)
        let output = UIGraphicsImageRenderer(size: size, format: format).jpegData(withCompressionQuality: 0.85) {
            context in
            UIColor.white.setFill()
            context.fill(CGRect(origin: .zero, size: size))
            UIImage(cgImage: image).draw(in: CGRect(origin: .zero, size: size))
        }
        guard (12...4_194_304).contains(output.count) else { throw NestAPIFailure.invalid }
        return output
    }

    static func pdf(_ url: URL) throws -> Data {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        let data = try handle.read(upToCount: 4_194_305) ?? Data()
        guard (12...4_194_304).contains(data.count), data.starts(with: Data("%PDF-".utf8)) else {
            throw NestAPIFailure.invalid
        }
        return data
    }
}
