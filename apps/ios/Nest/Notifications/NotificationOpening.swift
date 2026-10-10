import SwiftUI

struct NotificationOpening: ViewModifier {
    @ObservedObject var session: SessionModel
    @ObservedObject var inbox: PushNotificationInbox
    @State private var active: NestPushDestination?
    @State private var presentation = NotificationPresentationAvailability()
    @Environment(\.scenePhase) private var scenePhase

    func body(content: Content) -> some View {
        content
            .background(NotificationPresentationProbe(availability: presentation))
            .sheet(item: $active) { destination in
                if case .ready(let member) = session.status {
                    NavigationStack {
                        NotificationDestinationScreen(session: session, member: member, destination: destination)
                    }.id(session.generation)
                }
            }
            .onChange(of: session.status) { synchronizeAccount() }
            .task(id: OpeningState(pending: inbox.pending, status: session.status, phase: scenePhase, active: active)) {
                synchronizeAccount()
                await openWhenAvailable()
            }
    }

    private func synchronizeAccount() {
        switch session.status {
        case .ready(let member):
            if let active, (try? active.validated(member: member)) == nil { self.active = nil }
            inbox.bind(member)
        case .loading:
            active = nil
            inbox.bind(nil)
        default:
            active = nil
            inbox.signedOut()
        }
    }

    private func openWhenAvailable() async {
        while !Task.isCancelled, active == nil, inbox.pending != nil, scenePhase == .active,
            case .ready(let member) = session.status
        {
            if presentation.canPresent {
                active = inbox.take(member: member)
                return
            }
            // Preserve any existing sheet, alert or unsaved form. No network work happens while waiting.
            try? await Task.sleep(for: .milliseconds(200))
        }
    }

    private struct OpeningState: Equatable {
        let pending: NestPushDestination?
        let status: SessionModel.Status
        let phase: ScenePhase
        let active: NestPushDestination?
    }
}

private struct NotificationDestinationScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let destination: NestPushDestination
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Group {
            if (try? destination.validated(member: member)) != nil {
                target
            } else {
                Text("This notification is not available for your account.")
            }
        }
        .tint(QuietPalette.accent)
        .background(QuietPalette.background)
    }

    @ViewBuilder private var target: some View {
        switch destination.kind {
        case .renewal:
            RenewalReminderScreen(session: session, member: member, renewalId: destination.targetId)
        case .chore:
            ChoreReminderScreen(session: session, member: member, occurrenceId: destination.targetId)
        case .meal:
            MealReminderScreen(session: session, member: member, entryId: destination.targetId)
        case .grocery:
            GroceryReminderScreen(session: session, member: member, itemId: destination.targetId)
        case .recurring:
            RecurringReminderScreen(session: session, member: member, ruleId: destination.targetId)
        case .dailySummary:
            DailySummaryScreen(session: session, member: member, summaryId: destination.targetId)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}
