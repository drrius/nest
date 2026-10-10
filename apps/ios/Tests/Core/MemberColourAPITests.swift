import Foundation
import XCTest

@testable import NestCore

final class MemberColourAPITests: XCTestCase {
    private let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
    private let partner = UUID()

    private func api(_ respond: @escaping @Sendable (URLRequest) throws -> Data) throws -> SetupAPI {
        SetupAPI(
            http: try NestHTTP(baseURL: URL(string: "https://nest.example")!) { request in
                (
                    try respond(request),
                    HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
                )
            })
    }

    private static func envelope(
        _ colours: [[String: String]], member: VerifiedMember, actor: UUID? = nil
    ) throws -> Data {
        try JSONSerialization.data(withJSONObject: [
            "version": 1, "actorId": (actor ?? member.userId).uuidString,
            "householdId": member.householdId.uuidString, "colours": colours,
        ])
    }

    func testHouseholdColoursAreReadForThisMemberOnly() async throws {
        let me = member.userId.uuidString
        let partner = partner.uuidString
        let household = member.householdId.uuidString.lowercased()
        let member = member
        let read = try api { request in
            XCTAssertEqual(request.url?.path, "/v1/member-colours")
            XCTAssertEqual(request.httpMethod, "GET")
            XCTAssertEqual(request.value(forHTTPHeaderField: "X-Nest-Household"), household)
            return try Self.envelope(
                [
                    ["actorId": me, "colour": "plum", "revision": "2"],
                    ["actorId": partner, "colour": "teal", "revision": "1"],
                ], member: member)
        }
        let result = try await read.memberColours(token: "token", member: member)
        XCTAssertEqual(result.choices, [member.userId: .plum, self.partner: .teal])
        XCTAssertEqual(result.revision(of: member.userId), "2")
        XCTAssertEqual(result.revision(of: UUID()), "0")
    }

    func testForeignDuplicateOrUnknownColoursAreRejected() async throws {
        let me = member.userId.uuidString
        let partner = partner.uuidString
        let cases: [(colours: [[String: String]], actor: UUID?)] = [
            ([["actorId": me, "colour": "plum", "revision": "1"]], UUID()),
            (
                [
                    ["actorId": me, "colour": "plum", "revision": "1"],
                    ["actorId": partner, "colour": "plum", "revision": "1"],
                ], nil
            ),
            (
                [
                    ["actorId": me, "colour": "plum", "revision": "1"],
                    ["actorId": me, "colour": "teal", "revision": "2"],
                ], nil
            ),
            ([["actorId": me, "colour": "green", "revision": "1"]], nil),
            ([["actorId": me, "colour": "plum", "revision": "0"]], nil),
        ]
        for (colours, actor) in cases {
            let read = try api { [member = self.member] _ in try Self.envelope(colours, member: member, actor: actor) }
            do {
                _ = try await read.memberColours(token: "token", member: member)
                XCTFail("Accepted \(colours)")
            } catch {}
        }
    }

    func testSaveSendsOnlyTheColourAndChecksTheReceipt() async throws {
        let command = SaveMemberColour(operationId: UUID(), expectedRevision: "2", colour: .rose)
        let receipt: [String: String] = [
            "actorId": member.userId.uuidString, "householdId": member.householdId.uuidString,
            "operationId": command.operationId.uuidString, "revision": "3", "colour": "rose",
        ]
        let save = try api { request in
            XCTAssertEqual(request.url?.path, "/v1/member-colours/save")
            let body = try XCTUnwrap(JSONSerialization.jsonObject(with: request.httpBody ?? Data()) as? [String: Any])
            XCTAssertEqual(Set(body.keys), ["operationId", "expectedRevision", "colour"])
            XCTAssertEqual(body["colour"] as? String, "rose")
            return try JSONSerialization.data(withJSONObject: ["version": 1, "receipt": receipt])
        }
        let result = try await save.saveMemberColour(token: "token", member: member, command: command)
        XCTAssertEqual(result.revision, "3")
        for change: [String: String] in [["revision": "4"], ["colour": "teal"], ["actorId": UUID().uuidString]] {
            let wrong = try api { _ in
                try JSONSerialization.data(withJSONObject: [
                    "version": 1, "receipt": receipt.merging(change) { $1 },
                ])
            }
            do {
                _ = try await wrong.saveMemberColour(token: "token", member: member, command: command)
                XCTFail("Accepted a mismatched receipt \(change)")
            } catch { XCTAssertEqual(error as? NestAPIFailure, .contract) }
        }
        let stale = SaveMemberColour(operationId: UUID(), expectedRevision: "-1", colour: .rose)
        XCTAssertThrowsError(try stale.validated())
    }
}
