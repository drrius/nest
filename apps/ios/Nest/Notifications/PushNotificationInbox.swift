import Foundation
import SwiftUI

@MainActor
final class PushNotificationInbox: ObservableObject {
    @Published private(set) var pending: NestPushDestination?
    private(set) var member: VerifiedMember?
    private var waitingForAccount = true

    func receive(_ data: Data) {
        guard member != nil || waitingForAccount, let destination = try? NestPushDestination.decode(data) else {
            return
        }
        pending = destination
    }

    func bind(_ next: VerifiedMember?) {
        if member != nil, member != next { pending = nil }
        member = next
        waitingForAccount = next == nil
    }

    func signedOut() {
        member = nil
        pending = nil
        waitingForAccount = false
    }

    func take(member: VerifiedMember) -> NestPushDestination? {
        guard self.member == member else { return nil }
        let value = pending
        pending = nil
        return try? value?.validated(member: member)
    }

    func mayPresent(_ data: Data) -> Bool {
        guard let member, let destination = try? NestPushDestination.decode(data) else { return false }
        return (try? destination.validated(member: member)) != nil
    }
}
