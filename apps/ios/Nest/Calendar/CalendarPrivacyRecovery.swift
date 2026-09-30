import SwiftUI

/// Checks all foreground entry points without requesting EventKit permission.
struct CalendarPrivacyRecovery: ViewModifier {
    @ObservedObject var session: SessionModel
    @Environment(\.scenePhase) private var scenePhase
    private let reader = EventKitCalendarReader()

    func body(content: Content) -> some View {
        content
            .safeAreaInset(edge: .top) {
                if case .ready = session.status, session.calendarPrivacyPending {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Busy sharing removal is not confirmed.").font(.headline)
                        Text("Shared times may remain visible until removal succeeds or they expire. Try again online.")
                            .font(.subheadline)
                        Button("Retry removal") {
                            Task { await session.refreshCalendarPrivacy(access: reader.access) }
                        }
                        .disabled(session.calendarPrivacyRemoving)
                    }
                    .foregroundStyle(QuietPalette.ink)
                    .padding().frame(maxWidth: .infinity, alignment: .leading)
                    .background(QuietPalette.surface)
                }
            }
            .task(id: CheckState(status: session.status, generation: session.generation, phase: scenePhase)) {
                guard scenePhase == .active else { return }
                await session.refreshCalendarPrivacy(access: reader.access)
            }
    }

    private struct CheckState: Equatable {
        let status: SessionModel.Status
        let generation: Int
        let phase: ScenePhase
    }
}
