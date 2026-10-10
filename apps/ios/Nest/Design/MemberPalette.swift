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
