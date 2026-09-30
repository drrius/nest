import Foundation
import XCTest

@testable import NestCore

final class SetupTests: XCTestCase {
    func testAllEightIndependentFactsRoundTripWithoutAssumingPermissionOrCompletion() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
        for bits in 0..<8 {
            let status = SetupStatus(
                version: 1, actorId: member.userId, householdId: member.householdId,
                foodConfigured: bits & 1 != 0, cookingConfigured: bits & 2 != 0,
                notificationsConfigured: bits & 4 != 0)
            let encoded = try JSONEncoder().encode(status)
            let decoded = try JSONDecoder().decode(SetupStatus.self, from: encoded).validated(member: member)
            XCTAssertEqual(decoded, status)
            let object = try XCTUnwrap(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
            XCTAssertEqual(
                Set(object.keys),
                ["version", "actorId", "householdId", "foodConfigured", "cookingConfigured", "notificationsConfigured"])
        }
        for status in [
            SetupStatus(
                version: 2, actorId: member.userId, householdId: member.householdId,
                foodConfigured: true, cookingConfigured: true, notificationsConfigured: true),
            .init(
                version: 1, actorId: UUID(), householdId: member.householdId,
                foodConfigured: true, cookingConfigured: true, notificationsConfigured: true),
            .init(
                version: 1, actorId: member.userId, householdId: UUID(),
                foodConfigured: true, cookingConfigured: true, notificationsConfigured: true),
        ] { XCTAssertThrowsError(try status.validated(member: member)) }
        let valid = SetupStatus(
            version: 1, actorId: member.userId, householdId: member.householdId,
            foodConfigured: false, cookingConfigured: false, notificationsConfigured: false)
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(valid)) as? [String: Any])
        object.removeValue(forKey: "foodConfigured")
        XCTAssertThrowsError(
            try JSONDecoder().decode(SetupStatus.self, from: JSONSerialization.data(withJSONObject: object)))
        object["foodConfigured"] = "false"
        XCTAssertThrowsError(
            try JSONDecoder().decode(SetupStatus.self, from: JSONSerialization.data(withJSONObject: object)))
    }

    @MainActor
    func testFirstUseMetadataReopensButNeverCrossesMemberHouseholdOrBackend() throws {
        let suite = "setup-choice-\(UUID())"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let environment = URL(string: "https://nest-test.example")!
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
        let store = SetupChoiceStore(environment: environment, defaults: defaults)
        XCTAssertNil(store.read(member: member))
        try store.save(.quick, member: member)
        XCTAssertEqual(SetupChoiceStore(environment: environment, defaults: defaults).read(member: member), .quick)
        let partner = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Sam")
        XCTAssertNil(store.read(member: partner))
        try store.save(.comprehensive, member: partner)
        XCTAssertEqual(store.read(member: member), .quick)
        XCTAssertEqual(store.read(member: partner), .comprehensive)
        let moved = VerifiedMember(userId: member.userId, householdId: UUID(), displayName: "Alex")
        XCTAssertNil(store.read(member: moved))
        XCTAssertNil(
            SetupChoiceStore(environment: URL(string: "https://nest-other.example")!, defaults: defaults).read(
                member: member))
        let keys = defaults.dictionaryRepresentation().keys.filter { $0.hasPrefix("nest.first-use.") }
        XCTAssertEqual(keys.count, 2)
        for key in keys { defaults.set("completed", forKey: key) }
        XCTAssertNil(store.read(member: member), "Unknown metadata cannot claim a choice or completed setup")
        XCTAssertNil(store.read(member: partner))
    }

    func testSetupTransportIsBoundReadOnlyAndRejectsForeignScope() async throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { request in
            XCTAssertEqual(request.url?.path, "/v1/setup/status")
            XCTAssertEqual(request.httpMethod, "GET")
            XCTAssertNil(request.httpBody)
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer token")
            XCTAssertEqual(
                request.value(forHTTPHeaderField: "X-Nest-Household"), member.householdId.uuidString.lowercased())
            let value = SetupStatus(
                version: 1, actorId: member.userId, householdId: member.householdId,
                foodConfigured: false, cookingConfigured: true, notificationsConfigured: false)
            return (
                try JSONEncoder().encode(value),
                HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            )
        }
        let api = SetupAPI(http: http)
        let own = try await api.read(token: "token", member: member)
        XCTAssertFalse(own.foodConfigured)
        XCTAssertTrue(own.cookingConfigured)
        let foreign = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Sam")
        do {
            _ = try await api.read(token: "token", member: foreign)
            XCTFail("Read another member's setup")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .contract) }
    }
}
