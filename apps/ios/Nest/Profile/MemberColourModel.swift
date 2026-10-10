import Foundation

/// Reads and saves the household's colours. A seam so the model can be tested without a signed-in session.
struct MemberColourSync {
    let read: @MainActor () async throws -> MemberColoursEnvelope
    let save: @MainActor (MemberColor, String) async throws -> MemberColourReceipt

    @MainActor
    static func session(_ model: SessionModel, member: VerifiedMember) -> Self {
        Self(
            read: { try await model.readMemberColours(member: member) },
            save: { colour, expected in try await model.saveMemberColour(colour, expected: expected, member: member) }
        )
    }
}

/// Every member's saved colour. Your own choice shows straight away and rolls back if it can't be saved, for
/// example when your partner took it first. The last known colours stay on this iPhone so launch isn't grey.
@MainActor
final class MemberColourModel: ObservableObject {
    enum Notice: Equatable {
        case taken, changedElsewhere, failed
    }

    @Published private(set) var choices: [UUID: MemberColor]
    @Published private(set) var saving = false
    @Published var notice: Notice?
    private var revision: String
    /// Bumped on every local choice so a refresh that started earlier can't undo it.
    private var changes = 0
    private let member: VerifiedMember
    private let sync: MemberColourSync?
    private let defaults: UserDefaults
    private let key: String

    init(member: VerifiedMember, sync: MemberColourSync?, defaults: UserDefaults = .standard) {
        self.member = member
        self.sync = sync
        self.defaults = defaults
        key = "nest.member-colours.v2.\(member.householdId.uuidString).\(member.userId.uuidString)"
        let cached = defaults.data(forKey: key).flatMap { try? JSONDecoder().decode(Cache.self, from: $0) }
        choices = cached?.choices ?? [:]
        revision = cached?.revision ?? "0"
    }

    var choice: MemberColor? { choices[member.userId] }

    func refresh() async {
        let seen = changes
        guard let sync, !saving, let envelope = try? await sync.read(), changes == seen else { return }
        choices = envelope.choices
        revision = envelope.revision(of: member.userId)
        store()
    }

    /// Shows the colour immediately and saves it. The returned task finishes once the save settles.
    @discardableResult
    func choose(_ colour: MemberColor) -> Task<Void, Never>? {
        guard colour != choice, !saving else { return nil }
        let previous = choices
        choices[member.userId] = colour
        changes += 1
        notice = nil
        guard let sync else { return nil }
        saving = true
        return Task { await commit(colour, previous: previous, sync: sync) }
    }

    func palette(members: [NestMember]) -> MemberPalette {
        var names = [member.userId: member.displayName]
        for other in members { names[other.actorId] = other.displayName }
        let colors = MemberColorAssignment.resolve(members: Array(names.keys), choices: choices)
        return MemberPalette(me: member.userId, colors: colors, names: names)
    }

    private func commit(_ colour: MemberColor, previous: [UUID: MemberColor], sync: MemberColourSync) async {
        do {
            let receipt = try await sync.save(colour, revision)
            revision = receipt.revision
            saving = false
            store()
        } catch {
            choices = previous
            saving = false
            guard (error as? NestAPIFailure) == .conflict else {
                notice = .failed
                return
            }
            await refresh()
            let taken = choices.contains { $0.key != member.userId && $0.value == colour }
            notice = taken ? .taken : .changedElsewhere
        }
    }

    private func store() {
        defaults.set(try? JSONEncoder().encode(Cache(choices: choices, revision: revision)), forKey: key)
    }

    private struct Cache: Codable {
        let choices: [UUID: MemberColor]
        let revision: String
    }
}
