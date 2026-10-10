import Foundation

/// Reads and saves the household's colours. A seam so the model can be tested without a signed-in session.
struct MemberColourSync {
    let read: @MainActor () async throws -> MemberColoursEnvelope
    let save: @MainActor (MemberColor, String) async throws -> MemberColourReceipt
    /// The household's members, so both default colours and names resolve without waiting for Today.
    var roster: @MainActor () async throws -> [NestMember] = { [] }

    @MainActor
    static func session(_ model: SessionModel, member: VerifiedMember) -> Self {
        Self(
            read: { try await model.readMemberColours(member: member) },
            save: { colour, expected in try await model.saveMemberColour(colour, expected: expected, member: member) },
            roster: { try await model.readRoutineRoster(model.routineCreateContext()).members }
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
    @Published private(set) var roster: [NestMember]
    @Published private(set) var saving = false
    @Published var notice: Notice?
    private var revision: String
    /// Bumped by every refresh and every local choice. Only the newest may apply, so late reads can't go backwards.
    private var latest = 0
    /// Bumped by every local choice, so a slow failure can't put its notice on a newer choice.
    private var picks = 0
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
        roster = cached?.roster ?? []
    }

    var choice: MemberColor? { choices[member.userId] }

    func refresh() async {
        if let sync, let members = try? await sync.roster(), !members.isEmpty {
            roster = members
            // The cache holds confirmed colours only, never a choice that is still saving.
            if !saving { store() }
        }
        latest += 1
        let ticket = latest
        guard let sync, !saving, let envelope = try? await sync.read(), latest == ticket else { return }
        notice = nil
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
        latest += 1
        picks += 1
        notice = nil
        guard let sync else { return nil }
        saving = true
        let pick = picks
        return Task { await commit(colour, previous: previous, sync: sync, pick: pick) }
    }

    func palette(members: [NestMember]) -> MemberPalette {
        var names = [member.userId: member.displayName]
        for other in roster + members { names[other.actorId] = other.displayName }
        let ids = Set(names.keys).union(choices.keys)
        let colors = MemberColorAssignment.resolve(members: Array(ids), choices: choices)
        return MemberPalette(me: member.userId, colors: colors, names: names)
    }

    private func commit(
        _ colour: MemberColor, previous: [UUID: MemberColor], sync: MemberColourSync, pick: Int
    ) async {
        do {
            let receipt = try await sync.save(colour, revision)
            revision = receipt.revision
            saving = false
            store()
        } catch {
            choices = previous
            saving = false
            store()
            await refresh()
            // A lost response can hide a save that landed; the fresh read is the truth.
            guard picks == pick, choice != colour else { return }
            let taken = choices.contains { $0.key != member.userId && $0.value == colour }
            let conflict = (error as? NestAPIFailure) == .conflict
            notice = conflict ? (taken ? .taken : .changedElsewhere) : .failed
        }
    }

    private func store() {
        defaults.set(
            try? JSONEncoder().encode(Cache(choices: choices, revision: revision, roster: roster)), forKey: key)
    }

    private struct Cache: Codable {
        let choices: [UUID: MemberColor]
        let revision: String
        var roster: [NestMember]?
    }
}
