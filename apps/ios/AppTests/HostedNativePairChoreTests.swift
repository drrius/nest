import Foundation
import XCTest

@testable import Nest

@MainActor
final class HostedNativePairChoreTests: XCTestCase {
    private let title = "Nest native chore pair 20261005"
    private let actor = UUID(uuidString: "791f7261-6c9d-4061-9c8a-57aa6e0b0200")!
    private let partner = UUID(uuidString: "e5f80cfd-b69a-4aa0-a267-75784e943676")!
    private let household = UUID(uuidString: "be772ffd-3ab5-41d5-8438-647a79a553da")!

    func testOwnedNativeMemberReadsExactChoreAndHandover() async throws {
        let environment = ProcessInfo.processInfo.environment
        guard environment["NEST_QA_CHORE_PAIR_READ"] == "20261005" else {
            throw XCTSkip("Requires explicit read-only verification of the owned native chore pair.")
        }
        let role = try role(environment)
        let stage = try XCTUnwrap(environment["NEST_QA_CHORE_PAIR_STAGE"])
        XCTAssertTrue(
            ["absent", "initial", "pending_ab", "accepted", "pending_ba", "declined", "completed", "archived"].contains(
                stage))
        let day = try CivilDate(XCTUnwrap(environment["NEST_QA_CHORE_PAIR_DAY"]))
        let nextDay = try CivilDate(XCTUnwrap(environment["NEST_QA_CHORE_PAIR_NEXT_DAY"]))
        let configuration = try NestConfiguration.fromBundle()
        guard configuration.apiURL.absoluteString == "https://nest-test-api-drrius-projects.vercel.app",
            configuration.supabaseURL.absoluteString == "https://tkjixmujjoustdiedfmw.supabase.co",
            !configuration.pushEnabled
        else { throw ChorePairFixtureFailure.read }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        addTeardownBlock { [directory] in try FileManager.default.removeItem(at: directory) }
        do {
            let offline = try ChoreOfflineStore(url: directory.appendingPathComponent("pair-read.sqlite"))
            let auth = try NestAuth(configuration: configuration, offline: offline)
            let session = try await auth.session()
            guard session.userId == role.0 else { throw ChorePairFixtureFailure.read }
            let api = ChoreAPI(http: try NestHTTP(baseURL: configuration.apiURL))
            let member = try await api.verify(token: session.accessToken, expectedActor: role.0)
            guard member.householdId == household, member.displayName == role.1 else {
                throw ChorePairFixtureFailure.read
            }
            let list = try await api.routines(token: session.accessToken, member: member)
            let snapshot = try await api.snapshot(token: session.accessToken, member: member)
            let routines = list.routines.filter { $0.definition.title == title }
            let chores = snapshot.chores.filter { $0.title == title }
            let transfers = snapshot.transfers.filter { $0.title == title }
            try verify(stage, day: day, nextDay: nextDay, routines: routines, chores: chores, transfers: transfers)
            try record(routines, chores: chores, transfers: transfers, member: member, stage: stage)
        } catch { throw ChorePairFixtureFailure.read }
    }

    private func verify(
        _ stage: String, day: CivilDate, nextDay: CivilDate, routines: [HouseholdRoutine],
        chores: [NestChore], transfers: [PendingChoreTransfer]
    ) throws {
        if stage == "absent" {
            XCTAssertTrue(routines.isEmpty && chores.isEmpty && transfers.isEmpty)
            return
        }
        XCTAssertEqual(routines.count, 1)
        let routine = try XCTUnwrap(routines.first)
        XCTAssertEqual(routine.definition.schedule, .daily)
        XCTAssertEqual(routine.definition.assignment, .alternating(actor))
        XCTAssertEqual(routine.state, stage == "archived" ? .archived : .active)
        if stage == "archived" {
            XCTAssertTrue(chores.isEmpty && transfers.isEmpty)
            return
        }
        XCTAssertEqual(chores.count, 1)
        let chore = try XCTUnwrap(chores.first)
        XCTAssertEqual(chore.dueDate, stage == "completed" ? nextDay : day)
        let originalOwner = ["initial", "pending_ab"].contains(stage)
        XCTAssertEqual(chore.assigneeId, originalOwner ? actor : partner)
        if ["pending_ab", "pending_ba"].contains(stage) {
            XCTAssertEqual(transfers.count, 1)
            let transfer = try XCTUnwrap(transfers.first)
            XCTAssertEqual(transfer.occurrenceId, chore.id)
            XCTAssertEqual(transfer.dueDate, day)
            XCTAssertEqual(transfer.fromMemberId, originalOwner ? actor : partner)
            XCTAssertEqual(transfer.toMemberId, originalOwner ? partner : actor)
        } else {
            XCTAssertTrue(transfers.isEmpty)
        }
    }

    private func record(
        _ routines: [HouseholdRoutine], chores: [NestChore], transfers: [PendingChoreTransfer],
        member: VerifiedMember, stage: String
    ) throws {
        let report: [String: Any] = [
            "actor": member.userId.uuidString.lowercased(), "household": household.uuidString.lowercased(),
            "stage": stage,
            "routines": routines.map {
                ["id": $0.id.uuidString.lowercased(), "version": $0.version, "state": $0.state.rawValue]
            },
            "chores": chores.map {
                [
                    "id": $0.id.uuidString.lowercased(), "due": $0.dueDate.value,
                    "assignee": $0.assigneeId?.uuidString.lowercased() ?? "shared",
                ]
            },
            "transfers": transfers.map {
                [
                    "id": $0.requestId.uuidString.lowercased(), "occurrence": $0.occurrenceId.uuidString.lowercased(),
                    "from": $0.fromMemberId.uuidString.lowercased(), "to": $0.toMemberId.uuidString.lowercased(),
                ]
            },
        ]
        let attachment = XCTAttachment(
            data: try JSONSerialization.data(withJSONObject: report, options: [.sortedKeys]),
            uniformTypeIdentifier: "public.json")
        attachment.name = "Owned native chore pair read"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func role(_ environment: [String: String]) throws -> (UUID, String) {
        #if targetEnvironment(simulator)
            let roles = [
                "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A": (actor, "Test Alex"),
                "CA0BCEDE-A297-493A-8921-9E31F8B65783": (partner, "Test Sam"),
            ]
            return try XCTUnwrap(roles[XCTUnwrap(environment["SIMULATOR_UDID"])])
        #else
            throw XCTSkip("Fictional native pair tests are forbidden on physical phones.")
        #endif
    }
}

private enum ChorePairFixtureFailure: Error { case read }
