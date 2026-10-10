import Foundation
import XCTest

@testable import NestCore

final class ReceiptTransportTests: XCTestCase, @unchecked Sendable {
    func testExactBytesHeadersAndStoredResponse() async throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let bytes = Data("%PDF-1.7\nfictional fixture".utf8)
        let input = try ReceiptTransport.input(data: bytes, contentType: "application/pdf")
        let client = try ReceiptTransport(
            origin: URL(string: "https://storage.example")!, publishableKey: "sb_publishable_test"
        ) {
            request in
            XCTAssertEqual(request.httpBody, bytes)
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer fixture")
            XCTAssertEqual(
                request.value(forHTTPHeaderField: "X-Nest-Household"), member.householdId.uuidString.lowercased())
            XCTAssertEqual(request.value(forHTTPHeaderField: "apikey"), "sb_publishable_test")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/pdf")
            XCTAssertEqual(request.url?.path, "/functions/v1/nest-receipt-upload")
            XCTAssertEqual(request.url?.query, "uploadId=\(input.uploadId.uuidString.lowercased())")
            XCTAssertFalse(request.httpShouldHandleCookies)
            let result = ReceiptUploadReservation(
                version: 1, householdId: member.householdId, uploaderId: member.userId,
                uploadId: input.uploadId, sha256: input.sha256, bytes: bytes.count, contentType: input.contentType,
                path: input.path(household: member.householdId), stored: true)
            return (
                try JSONEncoder().encode(result),
                HTTPURLResponse(url: request.url!, statusCode: 201, httpVersion: nil, headerFields: nil)!
            )
        }
        let result = try await client.upload(input: input, data: bytes, token: "fixture", member: member)
        XCTAssertTrue(result.stored)
        do {
            _ = try await client.upload(input: input, data: bytes + Data([0]), token: "fixture", member: member)
            XCTFail("Changed file must never reach transport")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .invalid) }
    }

    func testRedirectAndIncorrectSuccessStatusesAreNotAccepted() async throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let bytes = Data(repeating: 0, count: 12)
        let input = try ReceiptTransport.input(data: bytes, contentType: "image/jpeg")
        for (status, expected) in [
            (200, NestAPIFailure.unavailable), (302, .unavailable), (401, .signedOut), (403, .forbidden),
            (409, .conflict), (413, .invalid),
        ] {
            let client = try ReceiptTransport(
                origin: URL(string: "https://storage.example")!, publishableKey: "sb_publishable_test"
            ) { request in
                (Data(), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
            }
            do {
                _ = try await client.upload(input: input, data: bytes, token: "fixture", member: member)
                XCTFail("Unexpected success")
            } catch { XCTAssertEqual(error as? NestAPIFailure, expected) }
        }
    }
}
