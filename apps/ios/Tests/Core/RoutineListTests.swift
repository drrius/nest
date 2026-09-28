import Foundation
import XCTest

@testable import NestCore

final class RoutineListTests: XCTestCase {
    func testRetainedTitlesAndVersionsArePreservedWhileTenantIdentityIsChecked() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let title = String(repeating: "🧹", count: 120)
        let routine = HouseholdRoutine(
            routineId: UUID(), version: "2026-09-28T09:00:00.123456Z",
            definition: .init(title: title, schedule: .weekly(1), assignment: .assigned(member.userId)), state: .paused)
        let page = RoutineList(
            version: 1, householdId: member.householdId, routines: [routine],
            members: [.init(actorId: member.userId, displayName: "Test")])
        XCTAssertEqual(try page.validated(member: member).routines.first, routine)
        let foreign = VerifiedMember(userId: member.userId, householdId: UUID(), displayName: "Other")
        XCTAssertThrowsError(try page.validated(member: foreign))
        let duplicate = RoutineList(
            version: 1, householdId: member.householdId, routines: [routine, routine], members: page.members)
        XCTAssertThrowsError(try duplicate.validated(member: member))
        for (text, version, assignment) in [
            (title + "x", routine.version, RoutineAssignment.shared),
            ("Tidy", "infinity", .shared),
            ("Tidy", routine.version, .assigned(UUID())),
        ] {
            let invalid = HouseholdRoutine(
                routineId: UUID(), version: version,
                definition: .init(title: text, schedule: .daily, assignment: assignment), state: .active)
            let bad = RoutineList(
                version: 1, householdId: member.householdId, routines: [invalid], members: page.members)
            XCTAssertThrowsError(try bad.validated(member: member))
        }
    }
}
