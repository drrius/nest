import CryptoKit
import Foundation
import XCTest

@testable import Nest

@MainActor
final class HostedPDFReceiptTests: XCTestCase {
    func testExistingPostedPDFDownloadsExactFixtureBytes() async throws {
        guard ProcessInfo.processInfo.environment["NEST_QA_READ_POSTED_PDF"] == "20261005" else {
            throw XCTSkip("Requires the existing, separately verified nest-test PDF expense and member session")
        }
        let configuration = try NestConfiguration.fromBundle()
        guard configuration.apiURL.absoluteString == "https://nest-test-api-drrius-projects.vercel.app",
            configuration.supabaseURL.absoluteString == "https://tkjixmujjoustdiedfmw.supabase.co",
            !configuration.pushEnabled
        else { throw NestAPIFailure.configuration }
        let store = try ChoreOfflineStore.application(environment: configuration.supabaseURL)
        let auth = try NestAuth(configuration: configuration, offline: store)
        let session = try await auth.session()
        let http = try NestHTTP(baseURL: configuration.apiURL)
        let member = try await ChoreAPI(http: http).verify(token: session.accessToken, expectedActor: session.userId)
        let money = MoneyAPI(http: http, storageOrigin: configuration.supabaseURL)
        let history = try await money.history(token: session.accessToken, member: member, before: nil)
        let matches = history.events.filter { $0.description == "Nest QA PDF posted 20261005" }
        XCTAssertEqual(matches.count, 1)
        let event = try XCTUnwrap(matches.first)
        XCTAssertEqual(event.amountCentimes.value, 2)
        XCTAssertTrue(event.hasReceipt)
        let detail = try await money.detail(token: session.accessToken, member: member, eventId: event.id)
        XCTAssertEqual(detail.shares.count, 2)
        XCTAssertTrue(detail.shares.allSatisfy { $0.allocatedCentimes?.value == 1 })
        XCTAssertEqual(detail.shares.reduce(Int64(0), { $0 + $1.deltaCentimes.value }), 0)
        let url = try await money.receiptLink(token: session.accessToken, member: member, eventId: event.id)
        let (bytes, response) = try await download(url)
        XCTAssertEqual(response.statusCode, 200)
        XCTAssertEqual(response.mimeType, "application/pdf")
        XCTAssertEqual(bytes.count, 640)
        XCTAssertTrue(bytes.starts(with: Data("%PDF-".utf8)))
        let hash = SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()
        XCTAssertEqual(hash, "2805607a936858af37610cf23cfb5ea9f2b6b410c246f4ecc2aceff09228fcc9")
        let report = try JSONSerialization.data(
            withJSONObject: [
                "status": response.statusCode, "mime": response.mimeType ?? "", "bytes": bytes.count,
                "sha256": hash, "nativeAuthenticatedDownload": true,
            ], options: [.sortedKeys])
        let attachment = XCTAttachment(data: report, uniformTypeIdentifier: "public.json")
        attachment.name = "Exact synthetic posted PDF download"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func download(_ url: URL) async throws -> (Data, HTTPURLResponse) {
        let session = URLSession(configuration: .ephemeral)
        defer { session.invalidateAndCancel() }
        do {
            let (data, response) = try await session.data(from: url)
            guard let http = response as? HTTPURLResponse else { throw NestAPIFailure.contract }
            return (data, http)
        } catch {
            throw NestAPIFailure.unavailable
        }
    }
}
