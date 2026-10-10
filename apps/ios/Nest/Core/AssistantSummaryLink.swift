import Foundation

enum AssistantSummaryLink: Equatable {
    case none
    case saved(DailySummarySnapshot)

    static func read(_ part: [String: AssistantJSON], member: VerifiedMember) -> Self? {
        guard part["state"] == .string("output-available"),
            case .object(let output) = part["output"], output["ok"] == .bool(true),
            let value = output["value"], let data = try? JSONEncoder().encode(value)
        else { return nil }
        switch part["type"]?.string {
        case "tool-readLatestDailySummary":
            guard let result = try? JSONDecoder().decode(LatestDailySummary.self, from: data),
                (try? result.validated(member: member)) != nil
            else { return nil }
            return result.latest.map { .saved($0) } ?? Self.none
        case "tool-readDailySummary":
            guard let result = try? JSONDecoder().decode(DailySummarySnapshot.self, from: data),
                (try? result.validated(member: member)) != nil
            else { return nil }
            return .saved(result)
        default: return nil
        }
    }
}
