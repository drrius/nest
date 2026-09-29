import SwiftUI

struct RecurringReminderRequestSection: View {
    @ObservedObject var model: RecurringReminderModel
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let id: UUID
    let saved: SavedRecurringReminderRequest

    var body: some View {
        Section("Your saved reminder request") {
            Text(saved.baseline.rule.configuration.description).font(.headline)
            Text(saved.command.settings.enabled ? "Reminder enabled" : "Reminder off")
            Text("Before the reviewed bill due date: \(saved.command.expectedDueOn.value)")
            Text(
                "\(saved.command.settings.daysBefore) days before · \(saved.command.settings.localTime) Europe/Zurich"
            )
            ForEach(saved.command.settings.recipientIds, id: \.self) { actor in
                Text(
                    actor == member.userId
                        ? "For you"
                        : "For \(model.members.first(where: { $0.actorId == actor })?.displayName ?? "selected member · connect to load name")"
                )
            }
            if saved.command.settings.recipientIds.isEmpty { Text("No recipients") }
            switch saved.result?.status {
            case .recorded:
                Text("Reminder choices saved. This does not confirm delivery.")
                if saved.cancellationRequested {
                    Text("The original choices were already recorded before cancellation. They have not been undone.")
                }
                Button("Done") { Task { await model.finish(id: id, session: session, member: member) } }
            case .cancelled:
                Text("This request was cancelled before its choices were recorded.")
                Button("Done") { Task { await model.finish(id: id, session: session, member: member) } }
            case .unresolved, nil:
                Text(
                    saved.cancellationRequested
                        ? "Cancellation is not confirmed. Connect to check the original request."
                        : "These choices are not confirmed. Check the original request before retrying.")
                Button("Check saved request") { Task { await model.retry(session: session, member: member) } }
                if !saved.cancellationRequested {
                    Button("Cancel unrecorded request", role: .destructive) {
                        Task { await model.cancel(session: session, member: member) }
                    }
                }
            }
        }.disabled(model.busy)
    }
}
