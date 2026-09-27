import Foundation
import XCTest

@testable import NestCore

final class MealWeekTests: XCTestCase {
    private let actor = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
    private let household = UUID(uuidString: "22222222-2222-4222-8222-222222222222")!
    private let entry = UUID(uuidString: "33333333-3333-4333-8333-333333333333")!
    private let start = try! MealWeekStart("2026-09-28")

    private var member: VerifiedMember {
        VerifiedMember(userId: actor, householdId: household, displayName: "Alex")
    }

    func testWeekUsesHouseholdTimezoneAcrossDSTAndMonthBoundary() throws {
        let now = try XCTUnwrap(ISO8601DateFormatter().date(from: "2026-03-29T22:30:00Z"))
        XCTAssertEqual(try MealWeekStart.current(now: now).date.value, "2026-03-30")
        XCTAssertEqual(
            start.days.map(\.value),
            [
                "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01",
                "2026-10-02", "2026-10-03", "2026-10-04",
            ])
        XCTAssertEqual(try start.adjacent(-1).date.value, "2026-09-21")
        XCTAssertThrowsError(try MealWeekStart("2026-09-29"))
    }

    func testWeekRejectsForeignHouseholdAndDuplicateSlot() throws {
        let week = try snapshot(rows: "\(row(entry)) , \(row(UUID()))")
        XCTAssertThrowsError(try week.validated(household: household, week: start))
        let valid = try snapshot(rows: row(entry))
        XCTAssertThrowsError(try valid.validated(household: UUID(), week: start))
    }

    func testPlacementReceiptBindsExactOperationActorAndNextRevision() throws {
        let week = try snapshot(rows: "")
        let command = try PlaceMeal(
            week: week, operationId: UUID(), date: try CivilDate("2026-09-29"),
            slot: .dinner, title: "  Pasta  ")
        XCTAssertEqual(command.title, "Pasta")
        let body = """
            {"version":1,"actorId":"\(actor)","householdId":"\(household)","operationId":"\(command.operationId)","entryId":"\(entry)","weekStart":"2026-09-28","date":"2026-09-29","slot":"dinner","revision":"1"}
            """
        let receipt = try JSONDecoder().decode(MealPlacementReceipt.self, from: Data(body.utf8))
        XCTAssertNoThrow(try receipt.validated(member: member, command: command))
        XCTAssertThrowsError(
            try receipt.validated(
                member: VerifiedMember(userId: UUID(), householdId: household, displayName: "Sam"),
                command: command))
        let changed = body.replacingOccurrences(of: "\"revision\":\"1\"", with: "\"revision\":\"2\"")
        let wrong = try JSONDecoder().decode(MealPlacementReceipt.self, from: Data(changed.utf8))
        XCTAssertThrowsError(try wrong.validated(member: member, command: command))
    }

    func testMealReadBindsHouseholdAndRequestedWeek() async throws {
        let expected = household.uuidString.lowercased()
        let empty =
            "{\"version\":1,\"householdId\":\"\(household)\",\"weekStart\":\"2026-09-28\",\"revision\":\"0\",\"entries\":[]}"
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example/")!) { request in
            XCTAssertEqual(request.url?.path, "/v1/meals/week")
            XCTAssertEqual(request.url?.query, "weekStart=2026-09-28")
            XCTAssertEqual(request.value(forHTTPHeaderField: "X-Nest-Household"), expected)
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (Data(empty.utf8), response)
        }
        let api = MealAPI(http: http)
        let week = try await api.week(token: "member-token", member: member, start: start)
        XCTAssertTrue(week.entries.isEmpty)
    }

    func testPlaceUsesCapturedRevisionAndRejectsForeignReceipt() async throws {
        let week = try snapshot(rows: "")
        let command = try PlaceMeal(
            week: week, operationId: UUID(), date: try CivilDate("2026-09-29"),
            slot: .dinner, title: "Pasta")
        let body = """
            {"version":1,"receipt":{"version":1,"actorId":"\(UUID())","householdId":"\(household)","operationId":"\(command.operationId)","entryId":"\(entry)","weekStart":"2026-09-28","date":"2026-09-29","slot":"dinner","revision":"1"}}
            """
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example/")!) { request in
            XCTAssertEqual(request.url?.path, "/v1/meals/place")
            XCTAssertEqual(request.httpMethod, "POST")
            let payload = try? JSONSerialization.jsonObject(with: request.httpBody ?? Data()) as? [String: Any]
            XCTAssertEqual(payload?["operationId"] as? String, command.operationId.uuidString)
            XCTAssertEqual(payload?["expectedRevision"] as? String, "0")
            XCTAssertEqual(payload?["date"] as? String, "2026-09-29")
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (Data(body.utf8), response)
        }
        do {
            _ = try await MealAPI(http: http).place(
                token: "member-token", member: member, week: week, command: command)
            XCTFail("Foreign actor receipt was accepted")
        } catch { XCTAssertTrue(error is MealContractError) }
    }

    func testCookingSlotsBindHouseholdAndRejectDuplicateSelection() throws {
        let body = """
            {"version":1,"householdId":"\(household)","profile":{"revision":"1","preferences":{"cookingNotes":"","mealSlots":["dinner","lunch"]}}}
            """
        let profile = try JSONDecoder().decode(CookingSlotsEnvelope.self, from: Data(body.utf8))
        XCTAssertEqual(try profile.validated(household: household), [.dinner, .lunch])
        XCTAssertThrowsError(try profile.validated(household: UUID()))
        let duplicate = body.replacingOccurrences(
            of: "[\"dinner\",\"lunch\"]", with: "[\"dinner\",\"dinner\"]")
        let invalid = try JSONDecoder().decode(CookingSlotsEnvelope.self, from: Data(duplicate.utf8))
        XCTAssertThrowsError(try invalid.validated(household: household))
    }

    private func snapshot(rows: String) throws -> MealWeekSnapshot {
        let body = """
            {"version":1,"householdId":"\(household)","weekStart":"2026-09-28","revision":"0","entries":[\(rows)]}
            """
        return try JSONDecoder().decode(MealWeekSnapshot.self, from: Data(body.utf8))
    }

    private func row(_ id: UUID) -> String {
        """
        {"entryId":"\(id)","date":"2026-09-29","slot":"dinner","title":"Pasta","recipeUrl":null,"notes":null,"definitionId":null,"leftoverSourceId":null}
        """
    }
}
