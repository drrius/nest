import Foundation
import XCTest

@testable import NestCore

final class HostedReceiptTests: XCTestCase {
    func testFictionalUploadReplayRecoveryAndCleanup() async throws {
        let (api, transport, member, token, env) = try await configuredUpload()
        let bytes = Data(
            "%PDF-1.4\n% Nest fictional upload verification\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n"
                .utf8)
        let input = try ReceiptTransport.input(data: bytes, contentType: "application/pdf")
        if let outsiderPath = env["NEST_TEST_OUTSIDER_TOKEN_FILE"] {
            let outsider = try String(contentsOfFile: outsiderPath, encoding: .utf8)
                .trimmingCharacters(in: .whitespacesAndNewlines)
            do {
                _ = try await transport.upload(input: input, data: bytes, token: outsider, member: member)
                XCTFail("Outsider uploaded into the household")
            } catch { XCTAssertEqual(error as? NestAPIFailure, .forbidden) }
            do {
                _ = try await api.receiptUploads(token: outsider, member: member, after: nil)
                XCTFail("Outsider read household receipt recovery")
            } catch {
                XCTAssertTrue([NestAPIFailure.forbidden, .notMember].contains(error as? NestAPIFailure ?? .contract))
            }
        }
        let uploaded = try await transport.upload(input: input, data: bytes, token: token, member: member)
        XCTAssertTrue(uploaded.stored)
        let replay = try await transport.upload(input: input, data: bytes, token: token, member: member)
        XCTAssertEqual(replay.path, uploaded.path)
        var found = false
        var cursor: UUID?
        repeat {
            let page = try await api.receiptUploads(token: token, member: member, after: cursor)
            if let row = page.uploads.first(where: { $0.uploadId == input.uploadId }) {
                XCTAssertEqual(row.input, input)
                XCTAssertTrue(row.stored)
                found = true
            }
            cursor = page.next
        } while cursor != nil && !found
        XCTAssertTrue(found)
        let cleanup = try await api.cleanupReceipt(token: token, member: member, input: input)
        XCTAssertEqual(cleanup.status, .deleted)
        let cleanedAgain = try await api.cleanupReceipt(token: token, member: member, input: input)
        XCTAssertEqual(cleanedAgain.status, .deleted)
        do {
            _ = try await transport.upload(input: input, data: bytes, token: token, member: member)
            XCTFail("Recreated a deleted upload")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .conflict) }
    }

    private func configuredUpload() async throws -> (
        MoneyAPI, ReceiptTransport, VerifiedMember, String, [String: String]
    ) {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_TEST_ALLOW_RECEIPT_WRITE"] == "1",
            env["NEST_TEST_API_URL"] == "https://nest-test-api-drrius-projects.vercel.app",
            env["NEST_TEST_STORAGE_URL"] == "https://tkjixmujjoustdiedfmw.supabase.co",
            let key = env["NEST_TEST_PUBLISHABLE_KEY"],
            let actor = env["NEST_TEST_ACTOR_ID"].flatMap(UUID.init(uuidString:)),
            let path = env["NEST_TEST_MEMBER_TOKEN_FILE"]
        else { throw XCTSkip("Explicit isolated receipt test configuration is required") }
        let token = try String(contentsOfFile: path, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines)
        let http = try NestHTTP(baseURL: URL(string: env["NEST_TEST_API_URL"]!)!)
        let member = try await MealAPI(http: http).verify(token: token, expectedActor: actor)
        guard member.displayName.hasPrefix("Test ") else { throw XCTSkip("Fictional member required") }
        let api = MoneyAPI(http: http)
        let transport = try ReceiptTransport(origin: URL(string: env["NEST_TEST_STORAGE_URL"]!)!, publishableKey: key)
        return (api, transport, member, token, env)
    }

}
