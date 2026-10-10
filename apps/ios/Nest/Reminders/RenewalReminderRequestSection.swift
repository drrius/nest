import SwiftUI

struct RenewalReminderRequestSection: View {
    @ObservedObject var model: RenewalReminderModel
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let id: UUID
    let saved: SavedRenewalReminderRequest

    var body: some View {
        Section("Your saved reminder request") {
            Text(saved.renewal.fields.title).font(.headline)
            Text(saved.command.settings.delivery.enabled ? "Reminder enabled" : "Reminder off")
            Text(saved.command.settings.anchor == .renewal ? "Before renewal" : "Before cancellation deadline")
            ReminderTimingText(settings: saved.command.settings.delivery)
            ForEach(saved.command.settings.delivery.recipientIds, id: \.self) { actor in
                Text(
                    actor == member.userId
                        ? "For you"
                        : "For \(model.members.first(where: { $0.actorId == actor })?.displayName ?? "selected member · connect to load name")"
                )
            }
            if saved.command.settings.delivery.recipientIds.isEmpty { Text("No recipients") }
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
