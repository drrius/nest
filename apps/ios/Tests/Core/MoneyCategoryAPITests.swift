import Foundation
import XCTest

@testable import NestCore

final class MoneyCategoryAPITests: XCTestCase {
    func testApprovalCategoryReadUsesBearerTenantAndExactIdentity() async throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let category = UUID()
        let envelope = MoneyCategoryEnvelope(
            version: 1, householdId: member.householdId, categoryId: category,
            category: .init(categoryId: category, name: "Household", archived: true))
        let api = try api(envelope, member: member, category: category)
        let result = try await api.category(token: "member-token", member: member, categoryId: category)
        XCTAssertEqual(result.category?.name, "Household")
        XCTAssertEqual(result.category?.archived, true)
    }

    func testCategoryReadRejectsForeignTenantAndSubstitutedCategory() async throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let category = UUID()
        let invalid = [
            MoneyCategoryEnvelope(version: 1, householdId: UUID(), categoryId: category, category: nil),
            MoneyCategoryEnvelope(version: 1, householdId: member.householdId, categoryId: UUID(), category: nil),
            MoneyCategoryEnvelope(
                version: 1, householdId: member.householdId, categoryId: category,
                category: .init(categoryId: UUID(), name: "Another category", archived: false)),
        ]
        for envelope in invalid {
            let api = try api(envelope, member: member, category: category)
            do {
                _ = try await api.category(token: "member-token", member: member, categoryId: category)
                XCTFail("A foreign or substituted category was accepted")
            } catch { XCTAssertEqual(error as? NestAPIFailure, .contract) }
        }
    }

    func testMissingCategoryRemainsMissingInsteadOfInventingAName() async throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let category = UUID()
        let envelope = MoneyCategoryEnvelope(
            version: 1, householdId: member.householdId, categoryId: category, category: nil)
        let api = try api(envelope, member: member, category: category)
        let result = try await api.category(token: "member-token", member: member, categoryId: category)
        XCTAssertNil(result.category)
    }

    private func api(_ envelope: MoneyCategoryEnvelope, member: VerifiedMember, category: UUID) throws -> MoneyAPI {
        let data = try JSONEncoder().encode(envelope)
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example/")!) { request in
            XCTAssertEqual(request.httpMethod, "GET")
            XCTAssertEqual(request.url?.path, "/v1/money/category")
            XCTAssertEqual(request.url?.query, "categoryId=\(category.uuidString.lowercased())")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer member-token")
            XCTAssertEqual(
                request.value(forHTTPHeaderField: "X-Nest-Household"), member.householdId.uuidString.lowercased())
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (data, response)
        }
        return MoneyAPI(http: http)
    }
}
