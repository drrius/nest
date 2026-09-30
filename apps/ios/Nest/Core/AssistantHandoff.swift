import Foundation

enum AssistantHandoff: Equatable {
    case calendar
    case calendarSharing
    case notifications
    case ingredients(MealWeekStart)

    static func read(_ part: [String: AssistantJSON], member: VerifiedMember) -> Self? {
        guard part["state"] == .string("output-available"),
            case .object(let output) = part["output"], output["ok"] == .bool(true),
            case .object(let value) = output["value"], value["kind"] == .string("device_handoff")
        else { return nil }
        switch part["type"]?.string {
        case "tool-openCalendarAgenda" where value["screen"] == .string("calendar"):
            return .calendar
        case "tool-openCalendarSettings" where value["screen"] == .string("calendar-sharing"):
            return .calendarSharing
        case "tool-openMealIngredientReview":
            return ingredients(value, member: member)
        case "tool-openNotificationSetup" where value["screen"] == .string("notification-preferences"):
            return .notifications
        default: return nil
        }
    }

    private static func ingredients(_ value: [String: AssistantJSON], member: VerifiedMember) -> Self? {
        guard value["screen"] == .string("meal-ingredients"),
            UUID(uuidString: value["householdId"]?.string ?? "") == member.householdId,
            let revision = value["revision"]?.string, MealRevision.valid(revision),
            let date = value["weekStart"]?.string, let week = try? MealWeekStart(date)
        else { return nil }
        return .ingredients(week)
    }
}
