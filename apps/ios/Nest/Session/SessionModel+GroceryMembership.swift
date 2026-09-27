import Foundation

extension SessionModel {
    func reverifyGroceryMembership(
        api: GroceryAPI, auth: any NestAuthentication,
        member: VerifiedMember, attempt: Int
    ) async -> Bool {
        do {
            let session = try await auth.session()
            guard generation == attempt, status == .ready(member) else { return true }
            guard session.userId == member.userId else {
                await leaveGroceryAccount(.signedOut)
                return true
            }
            let verified = try await api.verify(token: session.accessToken, expectedActor: member.userId)
            guard generation == attempt, status == .ready(member) else { return true }
            guard verified.householdId == member.householdId else {
                await leaveGroceryAccount(.notMember)
                return true
            }
        } catch {
            guard generation == attempt, status == .ready(member) else { return true }
            let mapped = state(for: error)
            if mapped == .notMember || mapped == .signedOut {
                await leaveGroceryAccount(mapped)
                return true
            }
        }
        return false
    }

    func leaveGroceryAccount(_ next: Status) async {
        generation += 1
        let current = generation
        await clearPresentation()
        if generation == current { status = next }
    }
}
