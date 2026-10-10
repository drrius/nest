import SwiftUI
import UIKit

struct PushDeviceScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    @EnvironmentObject private var hardware: NativePushDevice
    @StateObject private var model = PushDeviceModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Form {
            Section {
                Text(
                    "Connect this iPhone to receive the reminders and summary you choose. Your partner has separate choices."
                )
                Text(
                    "Connecting does not turn on your daily summary or item reminder preferences, and does not confirm delivery."
                )
                .font(.footnote).foregroundStyle(QuietPalette.muted)
            }
            Section("iPhone permission") {
                Text(permissionText)
                Button("Open iPhone Settings") {
                    if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                }
            }
            if let saved = model.saved {
                PushDeviceRequestSection(
                    session: session, member: member, hardware: hardware, model: model, saved: saved)
            } else if let baseline = model.baseline {
                Section("Nest connection") {
                    Text(
                        baseline.enabled
                            ? "Nest has saved a connection for this iPhone."
                            : "This iPhone is not connected to Nest.")
                    if canConnect {
                        Button(baseline.enabled ? "Refresh connection" : "Connect this iPhone") {
                            Task { await model.connect(session: session, member: member, hardware: hardware) }
                        }.disabled(model.busy)
                    }
                    if baseline.enabled {
                        Button("Turn off on this iPhone") {
                            Task { await model.disconnect(session: session, member: member, hardware: hardware) }
                        }.disabled(model.busy)
                    }
                }
            }
            Section {
                availability
                if let notice = model.notice { Text(notice) }
                if model.busy { ProgressView("Checking this iPhone…") }
                Button("Reload connection") { load() }.disabled(model.busy)
            }
        }
        .navigationTitle("This iPhone")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(model.busy)
        .scrollContentBackground(.hidden).background(QuietPalette.background).tint(QuietPalette.accent)
        .task { await model.load(session: session, member: member, hardware: hardware) }
        .onChange(of: session.generation) { model.clear(hardware: hardware) }
        .onChange(of: scenePhase) { if scenePhase == .active { load() } }
        .onDisappear { model.clear(hardware: hardware) }
    }

    private var canConnect: Bool {
        if case .available = session.pushBuild { return hardware.supported && session.status == .ready(member) }
        return false
    }

    @ViewBuilder private var availability: some View {
        switch session.pushBuild {
        case .disabled: Text("Notification delivery is not enabled in this build. Your saved choices stay separate.")
        case .signingMissing:
            Text("This build is missing its APNs signing environment. Other Nest features still work.")
        case .available:
            if !hardware.supported {
                Text("Real notification enrollment needs an iPhone. Simulator notification injection is only a test.")
            }
        }
    }

    private var permissionText: String {
        switch model.permission {
        case .notAsked: "Not requested yet. Nest asks when you choose to connect."
        case .denied: "Off in iPhone Settings."
        case .allowed: "Allowed by iOS."
        case .quiet: "iOS allows quiet notifications."
        case .temporary: "iOS permission is temporary; a full connection is not available."
        case .unknown: "Could not check permission yet."
        }
    }

    private func load() { Task { await model.load(session: session, member: member, hardware: hardware) } }
}
