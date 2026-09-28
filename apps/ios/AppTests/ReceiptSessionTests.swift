import Foundation
import XCTest

@testable import Nest

@MainActor
final class ReceiptSessionTests: XCTestCase {
    func testLostUploadReplyRetriesSameBytesAndIdentifier() async throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
        let partner = UUID()
        let auth = FakeAuthentication(
            active: .init(userId: member.userId, accessToken: "token-A"),
            nextSignIn: .init(userId: partner, accessToken: "token-B"))
        let chores = FakeChoreServer(actorA: member.userId, actorB: partner, household: member.householdId)
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await chores.respond($0) }
        let server = RetriedReceiptServer(member: member)
        let transport = try ReceiptTransport(
            origin: URL(string: "https://storage.example")!, publishableKey: "sb_publishable_test"
        ) {
            try await server.respond($0)
        }
        let url = FileManager.default.temporaryDirectory.appending(path: "receipt-session-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let model = SessionModel(
            auth: auth, chores: ChoreAPI(http: http), offline: try ChoreOfflineStore(url: url),
            receiptTransport: transport)
        await model.restore()
        let context = try model.expenseContext()
        try await model.stageReceipt(data: Data(repeating: 1, count: 12), contentType: "image/jpeg", context: context)
        let staged = try await model.savedReceipt(context)
        do {
            _ = try await model.retryReceipt(context)
            XCTFail("Lost response reported success")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .unavailable) }
        let pending = try await model.savedReceipt(context)
        XCTAssertEqual(pending?.input, staged?.input)
        XCTAssertNil(pending?.reservation)
        let confirmed = try await model.retryReceipt(context)
        XCTAssertEqual(confirmed?.reservation?.stored, true)
        _ = try await model.retryReceipt(context)
        let count = await server.requests
        XCTAssertEqual(count, 2)
        await model.signOut()
        do {
            _ = try await model.retryReceipt(context)
            XCTFail("Reused signed-out upload context")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .signedOut) }
    }
}

private actor RetriedReceiptServer {
    let member: VerifiedMember
    var first: ReceiptUploadInput?
    var requests = 0
    init(member: VerifiedMember) { self.member = member }

    func respond(_ request: URLRequest) throws -> (Data, URLResponse) {
        let identifier = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!.queryItems![0].value!
        let input = try ReceiptTransport.input(
            data: request.httpBody!, contentType: "image/jpeg", uploadId: UUID(uuidString: identifier)!)
        requests += 1
        if first == nil {
            first = input
            throw URLError(.networkConnectionLost)
        }
        XCTAssertEqual(input, first)
        let reservation = ReceiptUploadReservation(
            version: 1, householdId: member.householdId, uploaderId: member.userId,
            uploadId: input.uploadId, sha256: input.sha256, bytes: input.bytes,
            contentType: input.contentType, path: input.path(household: member.householdId), stored: true)
        return (
            try JSONEncoder().encode(reservation),
            HTTPURLResponse(url: request.url!, statusCode: 201, httpVersion: nil, headerFields: nil)!
        )
    }
}
