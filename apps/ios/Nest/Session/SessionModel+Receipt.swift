import Foundation

extension SessionModel {
    func savedReceipt(_ context: ExpenseContext) async throws -> SavedReceiptUpload? {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        let saved = try await offline.readReceiptUpload(lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
        return saved
    }

    func stageReceipt(data: Data, contentType: String, context: ExpenseContext) async throws {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        _ = try await offline.stageReceiptUpload(data: data, contentType: contentType, lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }

    func retryReceipt(_ context: ExpenseContext) async throws -> SavedReceiptUpload? {
        guard let saved = try await savedReceipt(context), let offline else { throw OfflineFailure.invalidOperation }
        if saved.cleanupRequested {
            try await performReceiptCleanup(saved, context: context)
            return try await savedReceipt(context)
        }
        if saved.reservation != nil { return saved }
        guard let receiptTransport else { throw NestAPIFailure.configuration }
        let token = try await expenseToken(context)
        // Re-read after credential refresh: another action may have requested cleanup while it awaited.
        guard let current = try await savedReceipt(context), current.input == saved.input else {
            throw OfflineFailure.invalidOperation
        }
        if current.cleanupRequested { return try await retryReceipt(context) }
        let reservation = try await receiptTransport.upload(
            input: current.input, data: current.data, token: token, member: context.member)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.confirmReceiptUpload(reservation, lease: context.lease)
        let confirmed = try await savedReceipt(context)
        if confirmed?.cleanupRequested == true { return try await retryReceipt(context) }
        return confirmed
    }

    func removeReceipt(_ context: ExpenseContext) async throws -> SavedReceiptUpload? {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.requestReceiptCleanup(lease: context.lease)
        return try await retryReceipt(context)
    }

    private func performReceiptCleanup(_ saved: SavedReceiptUpload, context: ExpenseContext) async throws {
        guard let moneyAPI, let offline else { throw NestAPIFailure.configuration }
        let token = try await expenseToken(context)
        let result = try await moneyAPI.cleanupReceipt(token: token, member: context.member, input: saved.input)
        try requireMoneyAccount(context.member, generation: context.generation)
        // "deleting" is an unfinished server operation, so retain the recovery record.
        if result.status == .deleting { throw NestAPIFailure.unavailable }
        try await offline.finishReceiptCleanup(result, lease: context.lease)
    }
}
