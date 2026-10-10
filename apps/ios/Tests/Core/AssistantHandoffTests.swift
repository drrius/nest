import Foundation
import XCTest

@testable import NestCore

final class AssistantHandoffTests: XCTestCase {
    private let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")

    private func part(_ tool: String, value: [String: AssistantJSON]) -> [String: AssistantJSON] {
        [
            "type": .string("tool-\(tool)"), "state": .string("output-available"),
            "output": .object(["ok": .bool(true), "value": .object(value)]),
        ]
    }

    func testCalendarHandoffsRequireMatchingToolAndDestination() {
        let value: [String: AssistantJSON] = ["kind": .string("device_handoff"), "screen": .string("calendar")]
        let agenda = part("openCalendarAgenda", value: value)
        XCTAssertEqual(AssistantHandoff.read(agenda, member: member), .calendar)
        XCTAssertNil(AssistantHandoff.read(part("openCalendarSettings", value: value), member: member))
        var pending = agenda
        pending["state"] = .string("input-available")
        XCTAssertNil(AssistantHandoff.read(pending, member: member))
        var failed = agenda
        failed["output"] = .object(["ok": .bool(false), "value": .object(value)])
        XCTAssertNil(AssistantHandoff.read(failed, member: member))
        let sharing: [String: AssistantJSON] = [
            "kind": .string("device_handoff"), "screen": .string("calendar-sharing"),
        ]
        XCTAssertEqual(
            AssistantHandoff.read(part("openCalendarSettings", value: sharing), member: member), .calendarSharing)
    }

    func testIngredientHandoffRejectsForeignHouseholdAndInvalidWeekOrRevision() throws {
        var value: [String: AssistantJSON] = [
            "kind": .string("device_handoff"), "screen": .string("meal-ingredients"),
            "householdId": .string(member.householdId.uuidString),
            "weekStart": .string("2026-09-28"), "revision": .string("0"),
        ]
        func read() -> AssistantHandoff? {
            AssistantHandoff.read(part("openMealIngredientReview", value: value), member: member)
        }
        XCTAssertEqual(read(), .ingredients(try MealWeekStart("2026-09-28")))
        value["householdId"] = .string(UUID().uuidString)
        XCTAssertNil(read())
        value["householdId"] = .string(member.householdId.uuidString)
        value["weekStart"] = .string("2026-09-29")
        XCTAssertNil(read())
        value["weekStart"] = .string("2026-09-28")
        value["revision"] = .string("01")
        XCTAssertNil(read())
        value["revision"] = .string("9223372036854775808")
        XCTAssertNil(read())
    }

    func testNotificationHandoffRequiresSuccessfulMatchingDeviceNavigation() {
        let value: [String: AssistantJSON] = [
            "kind": .string("device_handoff"), "screen": .string("notification-preferences"),
        ]
        let handoff = part("openNotificationSetup", value: value)
        XCTAssertEqual(AssistantHandoff.read(handoff, member: member), .notifications)
        XCTAssertNil(AssistantHandoff.read(part("saveNotificationPreferences", value: value), member: member))
        var pending = handoff
        pending["state"] = .string("input-available")
        XCTAssertNil(AssistantHandoff.read(pending, member: member))
        var failed = handoff
        failed["output"] = .object(["ok": .bool(false), "value": .object(value)])
        XCTAssertNil(AssistantHandoff.read(failed, member: member))
        let wrong: [String: AssistantJSON] = ["kind": .string("device_handoff"), "screen": .string("settings")]
        XCTAssertNil(AssistantHandoff.read(part("openNotificationSetup", value: wrong), member: member))
    }

    func testSetupAndAccountHandoffsCannotBeSwappedOrClaimWrites() {
        for (tool, screen, expected) in [
            ("openSetup", "setup", AssistantHandoff.setup),
            ("openAccountSettings", "settings", AssistantHandoff.settings),
            ("openMemberColour", "member-colour", AssistantHandoff.memberColour),
        ] {
            let value: [String: AssistantJSON] = ["kind": .string("device_handoff"), "screen": .string(screen)]
            let output = part(tool, value: value)
            XCTAssertEqual(AssistantHandoff.read(output, member: member), expected)
            var pending = output
            pending["state"] = .string("input-available")
            XCTAssertNil(AssistantHandoff.read(pending, member: member))
            XCTAssertNil(AssistantHandoff.read(part("saveNotificationPreferences", value: value), member: member))
            let swapped: [String: AssistantJSON] = [
                "kind": .string("device_handoff"), "screen": .string(screen == "setup" ? "settings" : "setup"),
            ]
            XCTAssertNil(AssistantHandoff.read(part(tool, value: swapped), member: member))
        }
    }
}
