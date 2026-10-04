import Foundation

struct MoneyViewRead<Value: Sendable>: Sendable {
    let value: Value
    let notice: String?
}

extension SessionModel {
    func cachedMoneyRead<Value>(_ target: MoneyReadTarget<Value>, generation expected: Int) async throws
        -> MoneyViewRead<Value>?
    {
        try await requireCachedMoneyIdentity(target.member, generation: expected)
        guard let offline, let currentLease = lease else { throw NestAPIFailure.configuration }
        let ticket = try await offline.beginMoneyRead(target, lease: currentLease)
        let saved = try await offline.readMoneySnapshot(ticket)
        try Task.checkCancellation()
        try requireMoneyAccount(target.member, generation: expected)
        return saved.map(savedMoneyView)
    }

    private func savedMoneyView<Value>(_ saved: SavedMoneyRead<Value>) -> MoneyViewRead<Value> {
        MoneyViewRead(
            value: saved.value,
            notice:
                "Showing saved information from \(saved.savedAt.formatted(date: .abbreviated, time: .shortened)). Connect and refresh for updates."
        )
    }

    private func requireCachedMoneyIdentity(_ member: VerifiedMember, generation expected: Int) async throws {
        try requireMoneyAccount(member, generation: expected)
        guard let auth else { throw NestAPIFailure.configuration }
        let cached = await auth.cachedSession()
        try requireMoneyAccount(member, generation: expected)
        guard cached?.userId == member.userId else { throw NestAPIFailure.signedOut }
    }

    func cachedMoneyLease(auth: any NestAuthentication, generation expected: Int) async -> OfflineLease? {
        guard let offline, let session = await auth.cachedSession(), generation == expected else { return nil }
        let saved = try? await offline.persistedMoneyLease(actor: session.userId)
        return generation == expected ? saved : nil
    }

    func loadMoneyBalance(member: VerifiedMember, generation: Int) async throws -> MoneyViewRead<MoneyBalance> {
        try await loadMoneyRead(.balance(member), generation: generation) {
            try await self.readMoneyBalance(member: member, generation: generation)
        }
    }

    func loadMoneyHistory(member: VerifiedMember, generation: Int, before: UUID?) async throws
        -> MoneyViewRead<MoneyHistory>
    {
        try await loadMoneyRead(.history(member, before: before), generation: generation) {
            try await self.readMoneyHistory(member: member, generation: generation, before: before)
        }
    }

    func loadMoneyDetail(member: VerifiedMember, generation: Int, eventId: UUID) async throws
        -> MoneyViewRead<MoneyDetail>
    {
        try await loadMoneyRead(.detail(member, eventId: eventId), generation: generation) {
            try await self.readMoneyDetail(member: member, generation: generation, eventId: eventId)
        }
    }

    private func loadMoneyRead<Value>(
        _ target: MoneyReadTarget<Value>, generation expected: Int,
        live: () async throws -> Value
    ) async throws -> MoneyViewRead<Value> {
        try requireMoneyAccount(target.member, generation: expected)
        guard let offline, let currentLease = lease else { throw NestAPIFailure.configuration }
        let ticket = try await offline.beginMoneyRead(target, lease: currentLease)
        try requireMoneyAccount(target.member, generation: expected)
        let value: Value
        do {
            value = try await live()
        } catch {
            try Task.checkCancellation()
            try requireMoneyAccount(target.member, generation: expected)
            if [.signedOut, .notMember, .forbidden].contains(error as? NestAPIFailure) {
                try await offline.forgetMoneyReads(lease: currentLease)
                try requireMoneyAccount(target.member, generation: expected)
                await leaveMealAccount((error as? NestAPIFailure) == .signedOut ? .signedOut : .notMember)
                throw error
            }
            guard (error as? NestAPIFailure) == .unavailable || error is URLError else { throw error }
            try await requireCachedMoneyIdentity(target.member, generation: expected)
            guard let saved = try await offline.readMoneySnapshot(ticket) else { throw error }
            try Task.checkCancellation()
            try requireMoneyAccount(target.member, generation: expected)
            return savedMoneyView(saved)
        }
        try Task.checkCancellation()
        try requireMoneyAccount(target.member, generation: expected)
        do {
            try await offline.saveMoneyRead(value, ticket: ticket, savedAt: Date())
        } catch {
            try Task.checkCancellation()
            try requireMoneyAccount(target.member, generation: expected)
            return MoneyViewRead(value: value, notice: "Loaded online, but could not save for offline viewing.")
        }
        try Task.checkCancellation()
        try requireMoneyAccount(target.member, generation: expected)
        return MoneyViewRead(value: value, notice: nil)
    }
}
