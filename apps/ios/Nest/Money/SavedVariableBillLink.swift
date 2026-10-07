import SwiftUI

struct SavedVariableBillLink: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    @State private var saved: SavedVariableCycle?
    @State private var notice: String?
    @State private var working = false
    @State private var request = UUID()
    @State private var savedMember: VerifiedMember?
    @State private var savedGeneration: Int?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let saved, savedMember == member, savedGeneration == session.generation,
                session.status == .ready(member)
            {
                NavigationLink {
                    VariableCycleScreen(session: session, member: member, ruleId: saved.command.input.ruleId)
                        .id(session.generation)
                } label: {
                    QuietActionLabel("Bill confirmation")
                }
            }
            if let notice {
                Text(notice).foregroundStyle(QuietPalette.muted)
                Button {
                    Task { await load() }
                } label: {
                    QuietActionLabel("Check saved bill entry")
                }.disabled(working)
            }
        }
        .task(id: session.generation) { await load() }
    }

    private func load() async {
        let attempt = UUID()
        let generation = session.generation
        request = attempt
        saved = nil
        savedMember = nil
        savedGeneration = nil
        notice = nil
        working = true
        defer { if request == attempt { working = false } }
        do {
            let value = try await session.savedVariableBillEntry(member: member, generation: generation)
            try Task.checkCancellation()
            guard current(attempt, generation: generation) else { return }
            saved = value
            savedMember = member
            savedGeneration = generation
        } catch {
            guard current(attempt, generation: generation), !Task.isCancelled else { return }
            notice = "Could not check your saved bill entry. Try again before recording another bill."
        }
    }

    private func current(_ attempt: UUID, generation: Int) -> Bool {
        request == attempt && session.generation == generation && session.status == .ready(member)
    }
}
