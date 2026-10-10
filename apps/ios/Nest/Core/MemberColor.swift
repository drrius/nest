import Foundation

/// The colour each household member picks for themselves. Greens are excluded because they mean actions and chores.
public enum MemberColor: String, CaseIterable, Codable, Sendable {
    case lake, clay, plum, rose, marigold, teal, indigo, slate

    public var displayName: String {
        switch self {
        case .lake: "Lake"
        case .clay: "Clay"
        case .plum: "Plum"
        case .rose: "Rose"
        case .marigold: "Marigold"
        case .teal: "Teal"
        case .indigo: "Indigo"
        case .slate: "Slate"
        }
    }
}

/// Gives every member a distinct colour. Defaults follow the sorted member ids so both phones agree without storage;
/// a member's own choice wins, and anyone whose colour is already taken moves to the next free one.
public enum MemberColorAssignment {
    public static func resolve(members: [UUID], choices: [UUID: MemberColor]) -> [UUID: MemberColor] {
        let ordered = Array(Set(members)).sorted { $0.uuidString < $1.uuidString }
        var result: [UUID: MemberColor] = [:]
        var taken = Set<MemberColor>()
        for id in ordered where choices[id] != nil {
            guard let choice = choices[id], !taken.contains(choice) else { continue }
            result[id] = choice
            taken.insert(choice)
        }
        for (index, id) in ordered.enumerated() where result[id] == nil {
            let preferred = MemberColor.allCases[index % MemberColor.allCases.count]
            let color =
                taken.contains(preferred)
                ? MemberColor.allCases.first { !taken.contains($0) } ?? preferred : preferred
            result[id] = color
            taken.insert(color)
        }
        return result
    }

    /// Colours the member may pick: everything except what the other members currently show.
    public static func available(for member: UUID, in assignment: [UUID: MemberColor]) -> [MemberColor] {
        let others = Set(assignment.filter { $0.key != member }.values)
        return MemberColor.allCases.filter { !others.contains($0) }
    }
}
