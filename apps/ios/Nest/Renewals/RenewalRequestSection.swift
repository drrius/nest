import SwiftUI

struct RenewalRequestSection: View {
    @ObservedObject var model: RenewalsModel
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let saved: SavedRenewalCommand

    var body: some View {
        Section("Your saved renewal request") {
            Text(saved.command.removing ? "Remove from Nest" : "Save renewal").font(.headline)
            if let fields = saved.command.fields ?? saved.baseline?.fields {
                Text(fields.title)
                Text("Renews \(fields.renewalOn.value) · \(fields.noticeDays) days’ notice")
                if let deadline = fields.cancellationDeadline { Text("Cancel by \(deadline.value)") }
                if let id = fields.responsibleId {
                    Text(
                        "Responsible: \(model.members.first(where: { $0.actorId == id })?.displayName ?? "Assigned member · connect to load name")"
                    )
                } else {
                    Text("Unassigned")
                }
                if let id = fields.recurringRuleId {
                    NavigationLink("View linked recurring expense") {
                        RecurringRuleScreen(session: session, member: member, ruleId: id).id(session.generation)
                    }
                } else {
                    Text("No linked recurring expense")
                }
            }
            switch saved.result?.status {
            case .recorded:
                Text(saved.command.removing ? "Removed from Nest." : "Renewal saved.")
                if saved.cancellationRequested {
                    Text("The original change was already recorded before cancellation. It has not been undone.")
                }
                Button("Done") { Task { await model.finish(session: session, member: member) } }
            case .cancelled:
                Text("This request was cancelled before it was recorded.")
                Button("Done") { Task { await model.finish(session: session, member: member) } }
            case .unresolved, nil:
                Text(
                    saved.cancellationRequested
                        ? "Cancellation is not confirmed. Connect to check the original request."
                        : "This change is not confirmed. Nest will check the original request before retrying.")
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
