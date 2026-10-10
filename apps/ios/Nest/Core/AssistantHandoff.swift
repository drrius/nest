import Foundation

enum AssistantHandoff: Equatable {
    case calendar
    case calendarSharing
    case notifications
    case setup
    case settings
    case memberColour
    case ingredients(MealWeekStart)

    static func read(_ part: [String: AssistantJSON], member: VerifiedMember) -> Self? {
        guard part["state"] == .string("output-available"),
            case .object(let output) = part["output"], output["ok"] == .bool(true),
            case .object(let value) = output["value"], value["kind"] == .string("device_handoff")
        else { return nil }
        let type = part["type"]?.string ?? ""
        if type == "tool-openMealIngredientReview" { return ingredients(value, member: member) }
        guard let simple = screens[type], value["screen"] == .string(simple.screen) else { return nil }
        return simple.handoff
    }

    /// Navigation-only tools and the one screen each may open.
    private static let screens: [String: (screen: String, handoff: Self)] = [
        "tool-openCalendarAgenda": ("calendar", .calendar),
        "tool-openCalendarSettings": ("calendar-sharing", .calendarSharing),
        "tool-openNotificationSetup": ("notification-preferences", .notifications),
        "tool-openSetup": ("setup", .setup),
        "tool-openAccountSettings": ("settings", .settings),
        "tool-openMemberColour": ("member-colour", .memberColour),
    ]

    private static func ingredients(_ value: [String: AssistantJSON], member: VerifiedMember) -> Self? {
        guard value["screen"] == .string("meal-ingredients"),
            UUID(uuidString: value["householdId"]?.string ?? "") == member.householdId,
            let revision = value["revision"]?.string, MealRevision.valid(revision),
            let date = value["weekStart"]?.string, let week = try? MealWeekStart(date)
        else { return nil }
        return .ingredients(week)
    }
}
