import Foundation

struct FoodEditContext {
    let member: VerifiedMember
    let generation: Int
    let profile: FoodProfileEnvelope?
    let pending: SavedFoodPreference?
}

extension SessionModel {
    func cachedFoodContext() async throws -> FoodEditContext {
        guard case .ready(let member) = status, let offline, let lease else { throw NestAPIFailure.signedOut }
        let attempt = generation
        let profile = try await offline.readFoodProfile(lease: lease)
        let pending = try await offline.readFoodPreference(lease: lease)
        let context = FoodEditContext(member: member, generation: attempt, profile: profile, pending: pending)
        try requireFoodContext(context)
        return context
    }

    func refreshFoodContext(_ context: FoodEditContext) async throws -> FoodEditContext {
        try requireFoodContext(context)
        guard let auth, let api = foodAPI, let offline, let lease else { throw NestAPIFailure.signedOut }
        let session = try await auth.session()
        guard session.userId == context.member.userId else { throw NestAPIFailure.signedOut }
        try requireFoodContext(context)
        let fresh = try await api.read(token: session.accessToken, member: context.member)
        try requireFoodContext(context)
        try await offline.saveFoodProfile(fresh, lease: lease)
        try requireFoodContext(context)
        return try await cachedFoodContext()
    }

    func stageFoodPreferences(_ preferences: FoodPreferences, context: FoodEditContext) async throws {
        try requireFoodContext(context)
        guard let offline, let lease, let baseline = context.profile else { throw OfflineFailure.missingSnapshot }
        let command = SaveFoodPreferences(
            operationId: UUID(), expectedRevision: baseline.profile?.revision ?? "0", preferences: preferences)
        try await offline.enqueueFoodPreference(
            .init(baseline: baseline, command: command, state: .pending, receipt: nil), lease: lease)
        try requireFoodContext(context)
    }

    func retryFoodPreferences(_ context: FoodEditContext) async throws -> FoodEditContext {
        try requireFoodContext(context)
        guard let auth, let api = foodAPI, let offline, let lease else { throw NestAPIFailure.signedOut }
        guard let saved = try await offline.readFoodPreference(lease: lease), saved.state != .conflict
        else { throw OfflineFailure.invalidOperation }
        do {
            let session = try await auth.session()
            guard session.userId == context.member.userId else { throw NestAPIFailure.signedOut }
            try requireFoodContext(context)
            if saved.state == .pending {
                let receipt = try await api.save(
                    token: session.accessToken, member: context.member, command: saved.command)
                try requireFoodContext(context)
                try await offline.acknowledgeFoodPreference(receipt, lease: lease)
            }
            return try await refreshFoodContext(context)
        } catch {
            try requireFoodContext(context)
            switch error as? NestAPIFailure {
            case .conflict, .invalid, .removed, .cutover:
                if let pending = try await offline.readFoodPreference(lease: lease), pending.state == .pending {
                    try await offline.conflictFoodPreference(pending.command.operationId, lease: lease)
                }
            case .signedOut, .notMember:
                await leaveMealAccount(state(for: error))
            default: break
            }
            throw error
        }
    }

    func discardFoodConflict(_ context: FoodEditContext) async throws {
        try requireFoodContext(context)
        guard let offline, let lease else { throw OfflineFailure.sessionChanged }
        try await offline.discardConflictedFoodPreference(lease: lease)
        try requireFoodContext(context)
    }

    func requireFoodContext(_ context: FoodEditContext) throws {
        guard generation == context.generation, status == .ready(context.member)
        else { throw OfflineFailure.sessionChanged }
    }
}
