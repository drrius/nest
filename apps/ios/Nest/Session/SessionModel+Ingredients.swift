import Foundation

struct IngredientReviewContext {
    let member: VerifiedMember
    let generation: Int
    let week: MealWeekStart
    var saved: SavedIngredientReview?
    var listing: MealIngredientListing?
}

extension SessionModel {
    func ingredientReviewContext(week: MealWeekStart) async throws -> IngredientReviewContext {
        guard case .ready(let member) = status, let offline, let lease else { throw NestAPIFailure.signedOut }
        let attempt = generation
        let saved = try await offline.readIngredientReview(week: week, lease: lease)
        let context = IngredientReviewContext(member: member, generation: attempt, week: week, saved: saved)
        try requireIngredientContext(context)
        return context
    }

    func refreshIngredientReview(_ context: IngredientReviewContext) async throws -> IngredientReviewContext {
        try requireIngredientContext(context)
        guard let auth, let api = mealAPI, let offline, let lease else { throw NestAPIFailure.signedOut }
        let session = try await auth.session()
        guard session.userId == context.member.userId else { throw NestAPIFailure.signedOut }
        let week = try await api.week(token: session.accessToken, member: context.member, start: context.week)
        let listing = try await api.allIngredients(
            token: session.accessToken, member: context.member, week: context.week, revision: week.revision)
        try requireIngredientContext(context)
        var updated = context
        updated.listing = listing
        if context.saved?.pending == nil {
            let choices = try MealIngredientChoice.reconcile(
                rows: listing.ingredients, previous: context.saved?.choices ?? [])
            updated.saved = try await offline.saveIngredientReview(
                week: context.week, revision: listing.revision, choices: choices,
                expectedSequence: context.saved?.sequence, lease: lease)
        }
        try requireIngredientContext(context)
        return updated
    }

    func stageReviewedIngredients(_ choices: [MealIngredientChoice], context: IngredientReviewContext) async throws {
        try requireIngredientContext(context)
        guard let offline, let lease, let listing = context.listing, listing.complete,
            choices.map(\.id) == listing.ingredients.map(\.id),
            zip(choices, listing.ingredients).allSatisfy({ !$0.0.selected || $0.1.groceryItemId == nil })
        else { throw OfflineFailure.invalidOperation }
        let command = AddMealIngredients(
            operationId: UUID(), weekStart: context.week, expectedRevision: listing.revision,
            selected: choices.filter(\.selected).map(\.ingredient))
        _ = try command.validated()
        let saved = try await offline.saveIngredientReview(
            week: context.week, revision: listing.revision, choices: choices,
            expectedSequence: context.saved?.sequence, lease: lease)
        try requireIngredientContext(context)
        _ = try await offline.stageIngredientAddition(command, expectedSequence: saved.sequence, lease: lease)
        try requireIngredientContext(context)
    }

    func retryReviewedIngredients(_ context: IngredientReviewContext) async throws {
        try requireIngredientContext(context)
        guard let auth, let api = mealAPI, let offline, let lease else { throw NestAPIFailure.signedOut }
        guard let saved = try await offline.readIngredientReview(week: context.week, lease: lease),
            let command = saved.pending, !saved.conflicted
        else { throw OfflineFailure.invalidOperation }
        do {
            let session = try await auth.session()
            guard session.userId == context.member.userId else { throw NestAPIFailure.signedOut }
            try requireIngredientContext(context)
            let receipt = try await api.addIngredients(
                token: session.accessToken, member: context.member, command: command)
            try requireIngredientContext(context)
            try await offline.acknowledgeIngredientAddition(receipt, lease: lease)
        } catch {
            try requireIngredientContext(context)
            switch error as? NestAPIFailure {
            case .conflict, .invalid, .removed, .cutover:
                try await offline.conflictIngredientAddition(
                    week: context.week, operation: command.operationId, lease: lease)
            case .signedOut, .notMember:
                await leaveMealAccount(state(for: error))
            default: break
            }
            throw error
        }
    }

    func discardIngredientConflict(_ context: IngredientReviewContext) async throws {
        try requireIngredientContext(context)
        guard let offline, let lease, let operation = context.saved?.pending?.operationId
        else { throw OfflineFailure.invalidOperation }
        try await offline.discardConflictedIngredientAddition(week: context.week, operation: operation, lease: lease)
        try requireIngredientContext(context)
    }

    func requireIngredientContext(_ context: IngredientReviewContext) throws {
        guard generation == context.generation, status == .ready(context.member)
        else { throw OfflineFailure.sessionChanged }
    }
}
