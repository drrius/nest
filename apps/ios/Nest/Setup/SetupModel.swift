import Foundation
import SwiftUI

@MainActor
final class SetupModel: ObservableObject {
    @Published private(set) var status: SetupStatus?
    @Published private(set) var loading = false
    @Published private(set) var notice: String?
    private var request = UUID()

    func load(session: SessionModel, member: VerifiedMember) async {
        let attempt = UUID()
        request = attempt
        loading = true
        status = nil
        notice = nil
        defer { if request == attempt { loading = false } }
        do {
            let context = try session.setupContext(member: member)
            let current = try await session.readSetup(context)
            guard request == attempt, !Task.isCancelled else { return }
            try session.requireSetupAccount(context)
            status = current
        } catch {
            guard request == attempt, !Task.isCancelled, session.status == .ready(member) else { return }
            notice = "Could not check saved choices. You can keep using Nest and try again online."
        }
    }

    func clear() {
        request = UUID()
        status = nil
        loading = false
        notice = nil
    }
}
