import Foundation
import XCTest

@testable import NestCore

final class MealProposalEditAPITests: XCTestCase {
    func testExecutionAndRecoveryBindOriginalCommand() async throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let command = MealProposalEditCommand(
            action: .replace, operationId: UUID(), proposalId: UUID(),
            expectedRevision: "2", entryId: UUID(), definitionId: nil, expectedLibraryRevision: nil)
        let result = MealProposalEdit(
            version: 1, actorId: member.userId, householdId: member.householdId,
            command: command, expiresAt: 1, status: .pending, failure: nil, receipt: nil)
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { request in
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer test")
            XCTAssertEqual(
                request.value(forHTTPHeaderField: "X-Nest-Household"), member.householdId.uuidString.lowercased())
            if request.url?.path == "/v1/meals/proposal/edit" {
                XCTAssertEqual(request.timeoutInterval, 180)
                XCTAssertEqual(try JSONDecoder().decode(MealProposalEditCommand.self, from: request.httpBody!), command)
            } else {
                XCTAssertEqual(request.url?.path, "/v1/meals/proposal/edit/recover")
                XCTAssertEqual(request.timeoutInterval, 15)
                let query = try JSONDecoder().decode([String: UUID].self, from: request.httpBody!)
                XCTAssertEqual(query, ["operationId": command.operationId])
            }
            return (
                try JSONEncoder().encode(result),
                HTTPURLResponse(
                    url: request.url!, statusCode: 200,
                    httpVersion: nil, headerFields: nil)!
            )
        }
        let api = MealProposalAPI(http: http)
        let edited = try await api.edit(token: "test", member: member, command: command)
        XCTAssertEqual(edited, result)
        let recovered = try await api.recoverEdit(token: "test", member: member, command: command)
        XCTAssertEqual(recovered, result)
        let altered = MealProposalEditCommand(
            action: .replace, operationId: command.operationId,
            proposalId: command.proposalId, expectedRevision: "3", entryId: command.entryId,
            definitionId: nil, expectedLibraryRevision: nil)
        do {
            _ = try await api.recoverEdit(token: "test", member: member, command: altered)
            XCTFail("Accepted different recovered edit")
        } catch { XCTAssertTrue(error is MealProposalError) }
    }
}
