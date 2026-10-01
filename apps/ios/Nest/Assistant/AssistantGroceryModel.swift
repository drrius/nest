import Foundation
import SwiftUI

@MainActor
final class AssistantGroceryModel: ObservableObject {
    enum Status: Equatable {
        case idle, loading
        case loaded(GroceryItem?)
        case failed
    }
    @Published private(set) var status = Status.idle
    private var request = UUID()

    func load(session: SessionModel, member: VerifiedMember, result: AssistantGroceryActionLink) async {
        let current = UUID()
        request = current
        status = .loading
        do {
            let context = try session.assistantContext()
            guard context.member == member else { throw NestAPIFailure.signedOut }
            let item = try await session.readAssistantGrocery(result, context: context)
            guard request == current, !Task.isCancelled, session.status == .ready(member) else { return }
            status = .loaded(item)
        } catch {
            guard request == current, !Task.isCancelled, session.status == .ready(member) else { return }
            status = .failed
        }
    }

    func clear() {
        request = UUID()
        status = .idle
    }
}
