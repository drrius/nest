import Foundation
import XCTest

@testable import NestCore

final class ChoreContractsTests: XCTestCase {
    private let actor = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
    private let partner = UUID(uuidString: "22222222-2222-4222-8222-222222222222")!
    private let household = UUID(uuidString: "33333333-3333-4333-8333-333333333333")!

    private func snapshot(title: String = "Take out recycling") -> ChoreSnapshot {
        let chore = NestChore(
            occurrenceId: UUID(uuidString: "44444444-4444-4444-8444-444444444444")!,
            title: title, dueDate: try! CivilDate("2026-09-28"), assigneeId: actor,
            offlineEpoch: UUID(uuidString: "55555555-5555-4555-8555-555555555555")!
        )
        let transfer = PendingChoreTransfer(
            requestId: UUID(uuidString: "66666666-6666-4666-8666-666666666666")!,
            occurrenceId: chore.occurrenceId, dueDate: chore.dueDate,
            fromMemberId: actor, toMemberId: partner, title: title
        )
        return ChoreSnapshot(
            version: 1, householdId: household,
            members: [
                NestMember(actorId: actor, displayName: "Alex"), NestMember(actorId: partner, displayName: "Sam"),
            ],
            transfers: [transfer], chores: [chore])
    }

    func testCoherentSnapshotAcceptsItsMemberAndHousehold() throws {
        let wire = try JSONEncoder().encode(snapshot())
        let decoded = try JSONDecoder().decode(ChoreSnapshot.self, from: wire)
        XCTAssertEqual(try decoded.validated(household: household, actor: actor), snapshot())
    }

    func testTenantAndActorMismatchAreRejected() {
        let value = snapshot()
        XCTAssertThrowsError(try value.validated(household: UUID(), actor: actor))
        XCTAssertThrowsError(try value.validated(household: household, actor: UUID()))
    }

    func testIncoherentTransferAndDuplicateChoreAreRejected() throws {
        let value = snapshot()
        let wrong = PendingChoreTransfer(
            requestId: value.transfers[0].requestId,
            occurrenceId: value.transfers[0].occurrenceId,
            dueDate: value.transfers[0].dueDate,
            fromMemberId: actor, toMemberId: partner, title: "Changed title"
        )
        let altered = ChoreSnapshot(
            version: 1, householdId: household,
            members: value.members, transfers: [wrong], chores: value.chores)
        let duplicated = ChoreSnapshot(
            version: 1, householdId: household,
            members: value.members, transfers: value.transfers,
            chores: value.chores + value.chores)
        XCTAssertThrowsError(try altered.validated(household: household, actor: actor))
        XCTAssertThrowsError(try duplicated.validated(household: household, actor: actor))
    }

    func testCivilDateRejectsImpossibleDays() {
        XCTAssertNoThrow(try CivilDate("2024-02-29"))
        XCTAssertThrowsError(try CivilDate("2026-02-29"))
        XCTAssertThrowsError(try CivilDate("2026-13-01"))
        XCTAssertThrowsError(try CivilDate("2026-1-01"))
    }

    func testCompletionPreservesObservedEpochAndIdentity() throws {
        let command = CompleteChore(
            chore: snapshot().chores[0], operationId: UUID(),
            completedOn: try CivilDate("2026-09-28"))
        let data = try JSONEncoder().encode(command)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: String])
        XCTAssertEqual(object["offlineEpoch"], command.offlineEpoch?.uuidString)
        XCTAssertEqual(object["expectedDueDate"], "2026-09-28")
        XCTAssertEqual(object["operationId"], command.operationId.uuidString)
    }
}
