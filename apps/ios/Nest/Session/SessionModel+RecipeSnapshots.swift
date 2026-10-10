import Foundation

struct RecipeViewRead<Value: Sendable>: Sendable {
    let value: Value
    let notice: String?
    let fresh: Bool
}

extension SessionModel {
    func cachedRecipeRead<Value>(_ target: RecipeReadTarget<Value>, generation expected: Int) async throws
        -> RecipeViewRead<Value>?
    {
        try await requireCachedRecipeIdentity(target.member, generation: expected)
        guard let offline, let lease else { return nil }
        let ticket = try await offline.beginRecipeRead(target, lease: lease)
        let saved = try await offline.readRecipeSnapshot(ticket)
        try Task.checkCancellation()
        try await requireCachedRecipeIdentity(target.member, generation: expected)
        return saved.map(savedRecipeView)
    }

    func loadRecipeRead<Value>(
        _ target: RecipeReadTarget<Value>, generation expected: Int,
        live: () async throws -> Value
    ) async throws -> RecipeViewRead<Value> {
        try requireRecipeReadAccount(target.member, generation: expected)
        let capturedLease = lease
        let ticket: RecipeReadTicket<Value>?
        if let offline, let capturedLease {
            ticket = try await offline.beginRecipeRead(target, lease: capturedLease)
        } else {
            ticket = nil
        }
        try requireRecipeReadAccount(target.member, generation: expected)
        let value: Value
        do {
            value = try await live()
        } catch {
            try Task.checkCancellation()
            try requireRecipeReadAccount(target.member, generation: expected)
            try await handleRecipeReadDenial(error, member: target.member, generation: expected, lease: capturedLease)
            guard (error as? NestAPIFailure) == .unavailable || error is URLError else { throw error }
            try await requireCachedRecipeIdentity(target.member, generation: expected)
            guard let offline, let ticket, let saved = try await offline.readRecipeSnapshot(ticket) else { throw error }
            try Task.checkCancellation()
            try await requireCachedRecipeIdentity(target.member, generation: expected)
            return savedRecipeView(saved)
        }
        try Task.checkCancellation()
        try await requireCachedRecipeIdentity(target.member, generation: expected)
        if let offline, let ticket {
            do {
                try await offline.saveRecipeRead(value, ticket: ticket, savedAt: Date())
            } catch {
                try await requireCachedRecipeIdentity(target.member, generation: expected)
                return RecipeViewRead(
                    value: value, notice: "Loaded online, but this information could not be saved for offline viewing.",
                    fresh: true)
            }
        }
        try await requireCachedRecipeIdentity(target.member, generation: expected)
        return RecipeViewRead(value: value, notice: nil, fresh: true)
    }

    private func requireRecipeReadAccount(_ member: VerifiedMember, generation expected: Int) throws {
        guard generation == expected, status == .ready(member) else { throw OfflineFailure.sessionChanged }
    }

    private func handleRecipeReadDenial(
        _ error: Error, member: VerifiedMember, generation expected: Int, lease captured: OfflineLease?
    ) async throws {
        guard [.signedOut, .notMember, .forbidden].contains(error as? NestAPIFailure) else { return }
        if let offline, let captured {
            if (error as? NestAPIFailure) == .forbidden {
                try await offline.forgetRecipeReads(lease: captured)
            } else {
                try await offline.revokeMoneyMembership(lease: captured)
            }
        }
        try requireRecipeReadAccount(member, generation: expected)
        if (error as? NestAPIFailure) != .forbidden {
            await leaveMealAccount((error as? NestAPIFailure) == .signedOut ? .signedOut : .notMember)
        }
        throw error
    }

    private func requireCachedRecipeIdentity(_ member: VerifiedMember, generation expected: Int) async throws {
        try requireRecipeReadAccount(member, generation: expected)
        guard let auth else { throw NestAPIFailure.configuration }
        let cached = await auth.cachedSession()
        try requireRecipeReadAccount(member, generation: expected)
        guard cached?.userId == member.userId else { throw NestAPIFailure.signedOut }
    }

    private func savedRecipeView<Value>(_ saved: SavedRecipeRead<Value>) -> RecipeViewRead<Value> {
        RecipeViewRead(
            value: saved.value,
            notice:
                "Saved information from \(saved.savedAt.formatted(date: .abbreviated, time: .shortened)). Refresh when online.",
            fresh: false)
    }
}
