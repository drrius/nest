import SwiftUI

/// Checks all foreground entry points without requesting EventKit permission.
struct CalendarPrivacyRecovery: ViewModifier {
    @ObservedObject var session: SessionModel
    @Environment(\.scenePhase) private var scenePhase
    @State private var detailsPresented = false
    private let reader = EventKitCalendarReader()

    func body(content: Content) -> some View {
        VStack(spacing: 0) {
            if case .ready = session.status, session.calendarPrivacyPending {
                Button {
                    detailsPresented = true
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "exclamationmark.shield").font(.system(size: 20))
                            .accessibilityHidden(true)
                        Text("Busy sharing removal pending")
                            .font(.subheadline.weight(.semibold))
                            .fixedSize(horizontal: false, vertical: true)
                            .multilineTextAlignment(.leading)
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.right").font(.system(size: 14))
                            .accessibilityHidden(true)
                    }
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .padding(.horizontal, 20).padding(.vertical, 8)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityHint("Review why removal is pending and retry.")
                .foregroundStyle(QuietPalette.ink)
                .background(QuietPalette.soft)
            }
            content
        }
        .sheet(isPresented: $detailsPresented) {
            if case .ready = session.status, session.calendarPrivacyPending {
                CalendarPrivacyRecoveryDetails(session: session).id(session.generation)
            }
        }
        .onChange(of: session.generation) { detailsPresented = false }
        .onChange(of: session.calendarPrivacyPending) { _, pending in
            if !pending { detailsPresented = false }
        }
        .onChange(of: session.status) { _, status in
            if case .ready = status { return }
            detailsPresented = false
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
