import Network
import SwiftUI

@MainActor
final class NativeConnectivity: ObservableObject {
    @Published private(set) var connected = false
    private let monitor = NWPathMonitor()

    init() {
        monitor.pathUpdateHandler = { [weak self] path in
            let connected = path.status == .satisfied
            Task { @MainActor in self?.connected = connected }
        }
        monitor.start(queue: DispatchQueue(label: "ch.drrius.nest.connectivity"))
    }

    deinit { monitor.cancel() }
}

struct OfflineResume: ViewModifier {
    @ObservedObject var session: SessionModel
    @StateObject private var connectivity = NativeConnectivity()
    @Environment(\.scenePhase) private var phase
    private let calendar = EventKitCalendarReader()

    func body(content: Content) -> some View {
        content.onChange(
            of: Trigger(
                status: session.status, generation: session.generation, connected: connectivity.connected, phase: phase),
            initial: true
        ) { _, trigger in
            session.offlineReplayReady = trigger.connected && trigger.phase == .active
            guard session.offlineReplayReady, case .ready = trigger.status else { return }
            Task { await session.resumeOfflineWork(calendarAccess: calendar.access) }
        }
    }

    private struct Trigger: Equatable {
        let status: SessionModel.Status
        let generation: Int
        let connected: Bool
        let phase: ScenePhase
    }
}
