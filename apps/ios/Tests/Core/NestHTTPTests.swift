import Foundation
import XCTest

@testable import NestCore

final class NestHTTPTests: XCTestCase {
    private let actor = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
    private let household = UUID(uuidString: "33333333-3333-4333-8333-333333333333")!
    private let baseURL = URL(string: "https://nest.example/")!

    private func http(
        status: Int = 200, json: String,
        inspect: @escaping @Sendable (URLRequest) -> Void = { _ in }
    ) throws -> NestHTTP {
        try NestHTTP(baseURL: baseURL) { request in
            inspect(request)
            let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
            return (Data(json.utf8), response)
        }
    }

    func testGenerationUsesWorkerBudgetWhileOrdinaryReadsStayShort() async throws {
        let member = VerifiedMember(userId: actor, householdId: household, displayName: "Test")
        let client = try http(status: 503, json: "{}") { request in
            XCTAssertEqual(request.timeoutInterval, request.url?.path.hasSuffix("/generate") == true ? 180 : 15)
        }
        let proposal = MealProposalAPI(http: client)
        do {
            _ = try await proposal.generate(
                token: "test", member: member,
                command: .init(
                    operationId: UUID(), weekStart: try MealWeekStart("2035-06-04"),
                    expectedWeekRevision: "0", familiarOnly: false))
            XCTFail("Expected unavailable")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .unavailable) }
        do {
            _ = try await client.read("v1/session", token: "test", as: VerifiedSession.self)
            XCTFail("Expected unavailable")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .unavailable) }
    }

    func testVerifiedSessionBindsTheSupabaseActor() async throws {
        let body = """
            {"version":1,"member":{"userId":"\(actor.uuidString)","householdId":"\(household.uuidString)","displayName":"Alex"}}
            """
        let client = ChoreAPI(
            http: try http(json: body) { request in
                XCTAssertEqual(request.url?.absoluteString, "https://nest.example/v1/session")
                XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer test-token")
                XCTAssertEqual(request.httpMethod, "GET")
            })
        let member = try await client.verify(token: "test-token", expectedActor: actor)
        XCTAssertEqual(member.householdId, household)
        do {
            _ = try await client.verify(token: "test-token", expectedActor: UUID())
            XCTFail("Expected identity mismatch")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .contract) }
    }

    func testSnapshotRejectsCrossHouseholdPayload() async throws {
        let other = UUID()
        let body = """
            {"version":1,"householdId":"\(other.uuidString)","members":[{"actorId":"\(actor.uuidString)","displayName":"Alex"}],"transfers":[],"chores":[]}
            """
        let member = VerifiedMember(userId: actor, householdId: household, displayName: "Alex")
        let expectedHousehold = household.uuidString.lowercased()
        let client = ChoreAPI(
            http: try http(json: body) { request in
                XCTAssertEqual(request.value(forHTTPHeaderField: "X-Nest-Household"), expectedHousehold)
            })
        do {
            _ = try await client.snapshot(token: "test-token", member: member)
            XCTFail("Expected tenant mismatch")
        } catch { XCTAssertTrue(error is ChoreContractError) }
    }

    func testAuthAndCutoverFailuresRemainDistinct() async throws {
        let samples: [(Int, String, NestAPIFailure)] = [
            (401, "{}", .signedOut),
            (403, "{\"error\":{\"code\":\"not_a_member\"}}", .notMember),
            (403, "{\"error\":{\"code\":\"forbidden\"}}", .forbidden),
            (409, "{\"error\":{\"code\":\"cutover\"}}", .cutover),
            (409, "{\"error\":{\"code\":\"conflict\"}}", .conflict),
        ]
        for (status, body, expected) in samples {
            let client = try http(status: status, json: body)
            do {
                _ = try await client.read("v1/session", token: "test-token", as: VerifiedSession.self)
                XCTFail("Expected HTTP failure")
            } catch { XCTAssertEqual(error as? NestAPIFailure, expected) }
        }
    }

    func testCompletionUsesSameAuthorizedCommandAndChecksReceipt() async throws {
        let occurrence = UUID(uuidString: "44444444-4444-4444-8444-444444444444")!
        let epoch = UUID(uuidString: "55555555-5555-4555-8555-555555555555")!
        let chore = NestChore(
            occurrenceId: occurrence, title: "Recycle", dueDate: try CivilDate("2026-09-28"),
            assigneeId: nil, offlineEpoch: epoch)
        let command = CompleteChore(chore: chore, operationId: UUID(), completedOn: try CivilDate("2026-09-28"))
        let body = """
            {"version":1,"householdId":"\(household.uuidString)","receipt":{"version":1,"operationId":"\(command.operationId.uuidString)","occurrenceId":"\(occurrence.uuidString)","completedBy":"\(actor.uuidString)","completedOn":"2026-09-28","outcome":"completed"}}
            """
        let member = VerifiedMember(userId: actor, householdId: household, displayName: "Alex")
        let expectedHousehold = household.uuidString.lowercased()
        let client = ChoreAPI(
            http: try http(json: body) { request in
                XCTAssertEqual(request.httpMethod, "POST")
                XCTAssertEqual(request.value(forHTTPHeaderField: "X-Nest-Household"), expectedHousehold)
                let payload = try? JSONSerialization.jsonObject(with: request.httpBody ?? Data()) as? [String: String]
                XCTAssertEqual(payload?["operationId"], command.operationId.uuidString)
                XCTAssertEqual(payload?["offlineEpoch"], epoch.uuidString)
            })
        let receipt = try await client.complete(token: "test-token", member: member, command: command)
        XCTAssertEqual(receipt.operationId, command.operationId)
        XCTAssertEqual(receipt.occurrenceId, occurrence)
    }
}
