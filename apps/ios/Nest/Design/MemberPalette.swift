import SwiftUI

/// The household's members with their resolved colours, shared through the environment.
struct MemberPalette: Equatable, Sendable {
    var me: UUID?
    var colors: [UUID: MemberColor] = [:]
    var names: [UUID: String] = [:]

    func color(_ id: UUID?) -> MemberColor {
        guard let id else { return .lake }
        return colors[id] ?? .lake
    }

    func name(_ id: UUID?) -> String {
        guard let id else { return "Shared" }
        if id == me { return "You" }
        return names[id] ?? "Your partner"
    }

    func initial(_ id: UUID?) -> String {
        guard let id, let name = names[id]?.trimmingCharacters(in: .whitespaces), let first = name.first else {
            return "?"
        }
        return String(first).uppercased()
    }

    var partner: UUID? { names.keys.first { $0 != me } }
    var partnerName: String { partner.flatMap { names[$0] } ?? "your partner" }
}

private struct MemberPaletteKey: EnvironmentKey {
    static let defaultValue = MemberPalette()
}

extension EnvironmentValues {
    var memberPalette: MemberPalette {
        get { self[MemberPaletteKey.self] }
        set { self[MemberPaletteKey.self] = newValue }
    }
}

/// This member's colour choice. Stored on this iPhone only until colour sync is approved for the backend.
@MainActor
final class MemberColourModel: ObservableObject {
    @Published private(set) var choice: MemberColor?
    private let defaults: UserDefaults
    private let key: String

    init(member: VerifiedMember, defaults: UserDefaults = .standard) {
        self.defaults = defaults
        key = "nest.member-colour.v1.\(member.householdId.uuidString).\(member.userId.uuidString)"
        choice = defaults.string(forKey: key).flatMap(MemberColor.init(rawValue:))
    }

    func choose(_ color: MemberColor) {
        defaults.set(color.rawValue, forKey: key)
        choice = color
    }

    func palette(member: VerifiedMember, members: [NestMember]) -> MemberPalette {
        var names = [member.userId: member.displayName]
        for other in members { names[other.actorId] = other.displayName }
        let choices = choice.map { [member.userId: $0] } ?? [:]
        let colors = MemberColorAssignment.resolve(members: Array(names.keys), choices: choices)
        return MemberPalette(me: member.userId, colors: colors, names: names)
    }
}
