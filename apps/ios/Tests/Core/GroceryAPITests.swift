import Foundation
import XCTest

@testable import NestCore

final class GroceryAPITests: XCTestCase {
    private let actor = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
    private let household = UUID(uuidString: "22222222-2222-4222-8222-222222222222")!
    private let item = UUID(uuidString: "33333333-3333-4333-8333-333333333333")!
    private let epoch = UUID(uuidString: "44444444-4444-4444-8444-444444444444")!

    private var member: VerifiedMember {
        VerifiedMember(userId: actor, householdId: household, displayName: "Alex")
    }

    private func http(
        json: String, inspect: @escaping @Sendable (URLRequest) -> Void = { _ in }
    ) throws -> NestHTTP {
        try NestHTTP(baseURL: URL(string: "https://nest.example/")!) { request in
            inspect(request)
            let response = HTTPURLResponse(
                url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (Data(json.utf8), response)
        }
    }

    func testListChecksTenantAndDoesNotAcceptAnotherHousehold() async throws {
        let other = UUID()
        let body = """
            {"version":1,"householdId":"\(other)","groceries":[]}
            """
        let expected = household.uuidString.lowercased()
        let api = GroceryAPI(http: try http(json: body) { request in
            XCTAssertEqual(request.url?.path, "/v1/groceries")
            XCTAssertEqual(request.value(forHTTPHeaderField: "X-Nest-Household"), expected)
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer member-token")
        })
        do {
            _ = try await api.list(token: "member-token", member: member)
            XCTFail("Cross-household response was accepted")
        } catch { XCTAssertTrue(error is GroceryContractError) }
    }

    func testCheckUsesCapturedEpochAndRejectsAnotherReceipt() async throws {
        let item = try sampleItem()
        let command = CheckGrocery(item: item, operationId: UUID(), checked: true)
        let body = """
            {"version":1,"householdId":"\(household)","receipt":{"operation":"\(UUID())","target":"\(self.item)","version":"43","checked":true,"outcome":"applied"}}
            """
        let expected = household.uuidString.lowercased()
        let api = GroceryAPI(http: try http(json: body) { request in
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.url?.path, "/v1/groceries/check")
            XCTAssertEqual(request.value(forHTTPHeaderField: "X-Nest-Household"), expected)
            let payload = try? JSONSerialization.jsonObject(with: request.httpBody ?? Data()) as? [String: Any]
            XCTAssertEqual(payload?["itemId"] as? String, command.itemId.uuidString)
            XCTAssertEqual(payload?["operationId"] as? String, command.operationId.uuidString)
            XCTAssertEqual(payload?["offlineEpoch"] as? String, command.offlineEpoch?.uuidString)
            XCTAssertEqual(payload?["expectedVersion"] as? String, "42")
            XCTAssertEqual(payload?["checked"] as? Bool, true)
        })
        do {
            _ = try await api.check(token: "member-token", member: member, command: command)
            XCTFail("Unrelated receipt was accepted")
        } catch { XCTAssertTrue(error is GroceryContractError) }
    }

    private func sampleItem() throws -> GroceryItem {
        let body = """
            {"itemId":"\(item)","name":"Oat milk","quantity":null,"unit":null,"categoryId":null,"categoryName":null,"version":"42","checked":false,"legacyClaimed":false,"offlineEpoch":"\(epoch)","mealSource":null}
            """
        return try JSONDecoder().decode(GroceryItem.self, from: Data(body.utf8))
    }
}
