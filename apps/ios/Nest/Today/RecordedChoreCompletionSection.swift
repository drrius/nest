import SwiftUI

struct RecordedChoreCompletionSection: View {
    let receipt: ChoreCompletion
    let members: [NestMember]

    var body: some View {
        Section("Recorded completion") {
            Text(
                receipt.outcome == .alreadyCompleted
                    ? "This occurrence was already completed." : "This occurrence's completion was recorded.")
                .foregroundStyle(QuietPalette.ink)
            Text("By " + completer + " · " + receipt.completedOn.value).foregroundStyle(QuietPalette.muted)
            Text("This is the saved acknowledgement. The scheduled chores below show the current household work.")
                .font(.footnote).foregroundStyle(QuietPalette.muted)
        }.listRowBackground(QuietPalette.surface)
    }

    private var completer: String {
        members.first { $0.actorId == receipt.completedBy }?.displayName ?? "a household member"
    }
}
