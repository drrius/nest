import Foundation
import XCTest

@testable import Nest

final class ChoreEditDraftTests: XCTestCase {
    func testEveryScheduleAndAssignmentSurvivesEditingUnchanged() throws {
        let schedules: [RoutineSchedule] = [
            .oneOff(try CivilDate("2099-01-01")), .daily, .weekdays([1, 3, 7]),
            .weekly(2), .biweekly(5), .monthly(31), .afterCompletion(every: 3, unit: .weeks),
        ]
        for schedule in schedules {
            for assignment: RoutineAssignment in [.shared, .assigned(UUID()), .alternating(UUID())] {
                let original = CreateRoutine.Definition(title: "Tidy", schedule: schedule, assignment: assignment)
                var draft = try ChoreCreateDraft(definition: original)
                XCTAssertThrowsError(try draft.patch(comparedTo: original))
                draft.title = "New title"
                let patch = try draft.patch(comparedTo: original)
                XCTAssertEqual(patch.title, "New title")
                XCTAssertNil(patch.schedule)
                XCTAssertNil(patch.assignment)
            }
        }
    }

    func testScheduleEditPreservesLongLegacyTitle() throws {
        let original = CreateRoutine.Definition(
            title: String(repeating: "😀", count: 100), schedule: .daily, assignment: .shared)
        var draft = try ChoreCreateDraft(definition: original)
        draft.kind = "weekly"
        draft.weekday = 4
        let patch = try draft.patch(comparedTo: original)
        XCTAssertNil(patch.title)
        XCTAssertEqual(patch.schedule, .weekly(4))
        draft.title += "x"
        XCTAssertThrowsError(try draft.patch(comparedTo: original))
    }
}
