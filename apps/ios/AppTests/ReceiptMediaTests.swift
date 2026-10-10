import ImageIO
import UIKit
import UniformTypeIdentifiers
import XCTest

@testable import Nest

final class ReceiptMediaTests: XCTestCase {
    func testPhotoIsResizedAndLocationMetadataRemoved() throws {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let image = UIGraphicsImageRenderer(size: CGSize(width: 2400, height: 1200), format: format).image { context in
            UIColor.white.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 2400, height: 1200))
        }
        let input = NSMutableData()
        let destination = CGImageDestinationCreateWithData(input, UTType.jpeg.identifier as CFString, 1, nil)!
        CGImageDestinationAddImage(
            destination, image.cgImage!,
            [
                kCGImagePropertyGPSDictionary: [
                    kCGImagePropertyGPSLatitude: 47.0, kCGImagePropertyGPSLatitudeRef: "N",
                ],
                kCGImagePropertyExifDictionary: [kCGImagePropertyExifUserComment: "private fixture"],
            ] as CFDictionary)
        XCTAssertTrue(CGImageDestinationFinalize(destination))
        let original = CGImageSourceCreateWithData(input, nil)!
        let originalProperties = CGImageSourceCopyPropertiesAtIndex(original, 0, nil)! as NSDictionary
        XCTAssertNotNil(originalProperties[kCGImagePropertyGPSDictionary])
        let output = try ReceiptMedia.photo(input as Data)
        let source = CGImageSourceCreateWithData(output as CFData, nil)!
        let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil)! as NSDictionary
        XCTAssertEqual(properties[kCGImagePropertyPixelWidth] as? Int, 2000)
        XCTAssertEqual(properties[kCGImagePropertyPixelHeight] as? Int, 1000)
        XCTAssertNil(properties[kCGImagePropertyGPSDictionary])
        let exif = properties[kCGImagePropertyExifDictionary] as? NSDictionary
        XCTAssertNil(exif?[kCGImagePropertyExifUserComment])
        XCTAssertLessThanOrEqual(output.count, 4_194_304)
        XCTAssertThrowsError(try ReceiptMedia.photo(Data("not an image".utf8)))
    }

    func testPDFRejectsOversizeAndMislabelledFiles() throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "receipt-media-\(UUID()).pdf")
        defer { try? FileManager.default.removeItem(at: url) }
        let fixture = Data("%PDF-1.7\nfixture".utf8)
        try fixture.write(to: url)
        XCTAssertEqual(try ReceiptMedia.pdf(url), fixture)
        try Data(repeating: 0, count: 30).write(to: url)
        XCTAssertThrowsError(try ReceiptMedia.pdf(url))
        try (fixture + Data(repeating: 0, count: 4_194_304)).write(to: url)
        XCTAssertThrowsError(try ReceiptMedia.pdf(url))
    }
}
