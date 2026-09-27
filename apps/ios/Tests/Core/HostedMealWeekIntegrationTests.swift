import Foundation
import XCTest

@testable import NestCore

private struct RemoveFixtureMeal: Encodable {
    let operationId: UUID
    let entryId: UUID
    let weekStart: MealWeekStart
    let expectedRevision: String
}

private struct RemoveFixtureEnvelope: Decodable {
    struct Receipt: Decodable {
        let actorId: UUID
        let householdId: UUID
        let operationId: UUID
        let entryId: UUID
        let removed: Bool
    }
    let version: Int
    let receipt: Receipt
}

final class HostedMealWeekIntegrationTests: XCTestCase {
    func testIsolatedHostedMealReadPlaceReplayOutsiderDenialAndCleanup() async throws {
        let environment = ProcessInfo.processInfo.environment
        guard let apiString = environment["NEST_TEST_API_URL"],
            let apiURL = URL(string: apiString),
            let actorString = environment["NEST_TEST_ACTOR_ID"],
            let actor = UUID(uuidString: actorString),
            let memberPath = environment["NEST_TEST_MEMBER_TOKEN_FILE"],
            let outsiderPath = environment["NEST_TEST_OUTSIDER_TOKEN_FILE"]
        else { throw XCTSkip("Isolated hosted test credentials are not configured") }
        let memberToken = try token(at: memberPath)
        let outsiderToken = try token(at: outsiderPath)
        let http = try NestHTTP(baseURL: apiURL)
        let api = MealAPI(http: http)
        let member = try await api.verify(token: memberToken, expectedActor: actor)
        let start = try MealWeekStart("2035-04-02")
        let visibleSlots = try await api.visibleSlots(token: memberToken, member: member)
        XCTAssertFalse(visibleSlots.isEmpty)
        do {
            _ = try await api.visibleSlots(token: outsiderToken, member: member)
            XCTFail("Outsider read another household's cooking slots")
        } catch { assertDenied(error) }
        do {
            _ = try await api.week(token: outsiderToken, member: member, start: start)
            XCTFail("Outsider read another household's meal week")
        } catch { assertDenied(error) }
        let week = try await api.week(token: memberToken, member: member, start: start)
        let target = try XCTUnwrap(
            start.days.flatMap { day in
                MealSlot.allCases.map { (day, $0) }
            }.first { target in
                !week.entries.contains { $0.date == target.0 && $0.slot == target.1 }
            })
        let title = "Nest SwiftUI fictional meal \(UUID())"
        let command = try PlaceMeal(
            week: week, operationId: UUID(), date: target.0,
            slot: target.1, title: title)
        do {
            _ = try await api.place(
                token: outsiderToken, member: member, week: week, command: command)
            XCTFail("Outsider placed a meal in another household")
        } catch { assertDenied(error) }
        do {
            let placed = try await api.place(
                token: memberToken, member: member, week: week, command: command)
            let replay = try await api.place(
                token: memberToken, member: member, week: week, command: command)
            XCTAssertEqual(replay, placed)
            let fresh = try await api.week(token: memberToken, member: member, start: start)
            XCTAssertEqual(fresh.entries.filter { $0.id == placed.entryId }.count, 1)
            XCTAssertEqual(fresh.entries.first { $0.id == placed.entryId }?.title, title)
            try await removeFixture(
                title: title, api: api, http: http, token: memberToken, member: member,
                outsiderToken: outsiderToken, start: start)
        } catch {
            try? await removeFixture(
                title: title, api: api, http: http, token: memberToken, member: member,
                outsiderToken: outsiderToken, start: start)
            XCTFail("Hosted meal or cleanup failed for fictional title \(title): \(error)")
            throw error
        }
    }

    private func removeFixture(
        title: String, api: MealAPI, http: NestHTTP, token: String,
        member: VerifiedMember, outsiderToken: String, start: MealWeekStart
    ) async throws {
        let week = try await api.week(token: token, member: member, start: start)
        guard let entry = week.entries.first(where: { $0.title == title }) else { return }
        let command = RemoveFixtureMeal(
            operationId: UUID(), entryId: entry.id,
            weekStart: start, expectedRevision: week.revision)
        do {
            _ = try await http.write(
                "v1/meals/remove", token: outsiderToken, household: member.householdId,
                body: command, as: RemoveFixtureEnvelope.self)
            XCTFail("Outsider removed another household's meal")
        } catch { assertDenied(error) }
        let response = try await http.write(
            "v1/meals/remove", token: token, household: member.householdId,
            body: command, as: RemoveFixtureEnvelope.self)
        XCTAssertEqual(response.version, 1)
        XCTAssertEqual(response.receipt.actorId, member.userId)
        XCTAssertEqual(response.receipt.householdId, member.householdId)
        XCTAssertEqual(response.receipt.operationId, command.operationId)
        XCTAssertEqual(response.receipt.entryId, entry.id)
        XCTAssertTrue(response.receipt.removed)
        let after = try await api.week(token: token, member: member, start: start)
        XCTAssertFalse(after.entries.contains { $0.id == entry.id })
    }

    private func assertDenied(_ error: Error) {
        XCTAssertTrue(
            (error as? NestAPIFailure) == .notMember || (error as? NestAPIFailure) == .forbidden)
    }

    private func token(at path: String) throws -> String {
        try String(contentsOfFile: path, encoding: .utf8)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
