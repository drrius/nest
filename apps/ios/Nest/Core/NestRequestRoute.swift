import Foundation

public enum NestRequestRoute: String, Codable, Sendable {
    case session, moneyBalance, moneyHistory, moneyExpenseContext, moneyExpense, moneySettlement, moneyRecurring, money
    case meals, groceries, chores, renewals, availability, preferences, reminders, memories, notifications, unknown

    static func category(_ path: String) -> Self {
        guard let components = URLComponents(string: path), components.scheme == nil, components.host == nil else {
            return .unknown
        }
        let segments = components.path.split(separator: "/")
        guard segments.count >= 2, segments[0] == "v1" else { return .unknown }
        if segments[1] == "money" { return moneyRoute(segments) }
        return families[String(segments[1])] ?? .unknown
    }

    private static let families: [String: Self] = [
        "session": .session, "meals": .meals, "groceries": .groceries, "chores": .chores,
        "renewals": .renewals, "availability": .availability, "food-preferences": .preferences,
        "cooking-preferences": .preferences, "notification-preferences": .notifications,
        "push-devices": .notifications, "memories": .memories,
        "meal-reminders": .reminders, "chore-reminders": .reminders, "grocery-reminders": .reminders,
        "renewal-reminders": .reminders, "recurring-reminders": .reminders,
    ]

    private static func moneyRoute(_ segments: [Substring]) -> Self {
        guard segments.count >= 3 else { return .money }
        return moneyRoutes[String(segments[2])] ?? .money
    }

    private static let moneyRoutes: [String: Self] = [
        "balance": .moneyBalance, "history": .moneyHistory, "expense-context": .moneyExpenseContext,
        "expense": .moneyExpense, "settlement": .moneySettlement, "recurring": .moneyRecurring,
    ]
}
