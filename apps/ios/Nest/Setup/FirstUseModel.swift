import Foundation
import SwiftUI

@MainActor
final class FirstUseModel: ObservableObject {
    @Published var presented = false
    @Published private(set) var notice: String?
    private var context: SetupContext?

    func load(session: SessionModel, member: VerifiedMember) {
        do {
            let current = try session.setupContext(member: member)
            context = current
            presented = session.setupChoices?.read(member: member) == nil
        } catch { clear() }
    }

    func choose(_ choice: SetupChoice, session: SessionModel) -> Bool {
        guard let context else { return false }
        do {
            try session.requireSetupAccount(context)
            guard let choices = session.setupChoices else { throw NestAPIFailure.configuration }
            try choices.save(choice, member: context.member)
            notice = nil
            return true
        } catch {
            notice = "Could not remember this choice on this iPhone. You can close setup and keep using Nest."
            return false
        }
    }

    func clear() {
        presented = false
        notice = nil
        context = nil
    }

    func continueForNow(session: SessionModel) -> Bool {
        guard let context, (try? session.requireSetupAccount(context)) != nil else { return false }
        presented = false
        return true
    }
}
