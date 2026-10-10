import Foundation
import XCTest

@testable import NestCore

final class HostedCalendarPublishTests: XCTestCase {
    func testSyntheticPublishReplayAndOptOutDeletion() async throws {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_TEST_API_URL"] == "https://nest-test-api-drrius-projects.vercel.app",
            let actor = env["NEST_TEST_ACTOR_ID"].flatMap(UUID.init(uuidString:)),
            let path = env["NEST_TEST_MEMBER_TOKEN_FILE"], let outsiderPath = env["NEST_TEST_OUTSIDER_TOKEN_FILE"]
        else { throw XCTSkip("Isolated test credentials are not configured") }
        let token = try String(contentsOfFile: path, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines)
        let outsider = try String(contentsOfFile: outsiderPath, encoding: .utf8).trimmingCharacters(
            in: .whitespacesAndNewlines)
        let http = try NestHTTP(baseURL: URL(string: "https://nest-test-api-drrius-projects.vercel.app")!)
        let member = try await MealAPI(http: http).verify(token: token, expectedActor: actor)
        guard member.displayName.hasPrefix("Test ") else { throw NestAPIFailure.forbidden }
        let api = CalendarAPI(http: http)
        let baseline = try await api.consent(token: token, member: member)
        let snapshots = try await api.snapshots(token: token, member: member)
        guard !baseline.enabled, !snapshots.snapshots.contains(where: { $0.actorId == actor }) else {
            throw XCTSkip("Fictional account must start disabled without an existing snapshot")
        }
        do {
            try await publish(api: api, token: token, member: member, baseline: baseline, outsider: outsider)
        } catch {
            try await disable(api: api, token: token, member: member)
            throw error
        }
        try await disable(api: api, token: token, member: member)
        let ended = try await api.snapshots(token: token, member: member)
        XCTAssertFalse(ended.snapshots.contains { $0.actorId == actor })
        let consent = try await api.consent(token: token, member: member)
        XCTAssertFalse(consent.enabled)
    }

    private func publish(
        api: CalendarAPI, token: String, member: VerifiedMember, baseline: CalendarConsent, outsider: String
    )
        async throws
    {
        let enable = SetCalendarConsent(
            incarnation: baseline.incarnation, operationId: UUID(), expectedRevision: baseline.version, enabled: true)
        let active = try await api.setConsent(token: token, member: member, command: enable)
        let replayed = try await api.setConsent(token: token, member: member, command: enable)
        XCTAssertEqual(active, replayed)
        let capture = try await api.begin(
            token: token, member: member,
            command: .init(incarnation: active.incarnation, consent: active.version))
        let start = Int64(Date().timeIntervalSince1970 * 1000)
        let command = PublishBusy(
            incarnation: capture.incarnation, consent: capture.consent, generation: capture.generation,
            covered: .init(start: start, end: start + 86_400_000),
            intervals: [.init(start: start + 3_600_000, end: start + 7_200_000)])
        do {
            _ = try await api.publish(token: outsider, member: member, command: command, capture: capture)
            XCTFail("Outsider published another household's busy data")
        } catch {
            XCTAssertTrue((error as? NestAPIFailure) == .forbidden || (error as? NestAPIFailure) == .notMember)
        }
        let receipt = try await api.publish(token: token, member: member, command: command, capture: capture)
        let repeated = try await api.publish(token: token, member: member, command: command, capture: capture)
        XCTAssertEqual(receipt.generation, repeated.generation)
        let read = try await api.snapshots(token: token, member: member)
        let own = try XCTUnwrap(read.snapshots.first { $0.actorId == member.userId })
        XCTAssertEqual(own.generation, capture.generation)
        XCTAssertEqual(own.covered, command.covered)
        XCTAssertEqual(own.intervals, command.intervals)
        let pending = try await api.begin(
            token: token, member: member,
            command: .init(incarnation: active.incarnation, consent: active.version))
        try await disable(api: api, token: token, member: member)
        let revoked = PublishBusy(
            incarnation: pending.incarnation, consent: pending.consent,
            generation: pending.generation, covered: command.covered, intervals: command.intervals)
        do {
            _ = try await api.publish(token: token, member: member, command: revoked, capture: pending)
            XCTFail("Published a capture after opt-out")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .conflict) }
    }

    private func disable(api: CalendarAPI, token: String, member: VerifiedMember) async throws {
        let current = try await api.consent(token: token, member: member)
        guard current.enabled else { return }
        _ = try await api.setConsent(
            token: token, member: member,
            command: .init(
                incarnation: current.incarnation, operationId: UUID(), expectedRevision: current.version, enabled: false
            ))
    }
}
