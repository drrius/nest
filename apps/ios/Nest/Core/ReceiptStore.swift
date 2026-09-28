import Foundation

struct SavedReceiptUpload: Codable, Sendable {
    let input: ReceiptUploadInput
    let data: Data
    var reservation: ReceiptUploadReservation?
    var cleanupRequested: Bool
}

extension ChoreOfflineStore {
    func readReceiptUpload(lease: OfflineLease) throws -> SavedReceiptUpload? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM receipt_uploads WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first else { return nil }
        let saved = try JSONDecoder().decode(SavedReceiptUpload.self, from: Data(body.utf8))
        guard
            try ReceiptTransport.input(
                data: saved.data, contentType: saved.input.contentType, uploadId: saved.input.uploadId) == saved.input
        else { throw OfflineFailure.invalidOperation }
        if let reservation = saved.reservation {
            _ = try reservation.validated(member: receiptMember(lease), input: saved.input, requireStored: true)
        }
        return saved
    }

    func stageReceiptUpload(data: Data, contentType: String, lease: OfflineLease) throws -> SavedReceiptUpload {
        try authorize(lease)
        guard try readReceiptUpload(lease: lease) == nil else { throw OfflineFailure.invalidOperation }
        let saved = SavedReceiptUpload(
            input: try ReceiptTransport.input(data: data, contentType: contentType), data: data,
            reservation: nil, cleanupRequested: false)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("INSERT INTO receipt_uploads(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
        return saved
    }

    func confirmReceiptUpload(_ reservation: ReceiptUploadReservation, lease: OfflineLease) throws {
        guard var saved = try readReceiptUpload(lease: lease) else { throw OfflineFailure.invalidOperation }
        _ = try reservation.validated(member: receiptMember(lease), input: saved.input, requireStored: true)
        saved.reservation = reservation
        try saveReceiptUpload(saved, lease: lease)
    }

    func requestReceiptCleanup(lease: OfflineLease) throws {
        guard var saved = try readReceiptUpload(lease: lease) else { throw OfflineFailure.invalidOperation }
        // Resolve any expense that could already be claiming this file before deleting it.
        if let expense = try readExpense(lease: lease),
            expense.command.expense.receiptPath == saved.input.path(household: lease.household),
            expense.result?.status != .cancelled
        {
            throw OfflineFailure.invalidOperation
        }
        saved.cleanupRequested = true
        try saveReceiptUpload(saved, lease: lease)
    }

    func finishReceiptCleanup(_ result: ReceiptCleanup, lease: OfflineLease) throws {
        guard let saved = try readReceiptUpload(lease: lease), saved.cleanupRequested else {
            throw OfflineFailure.invalidOperation
        }
        _ = try result.validated(member: receiptMember(lease), input: saved.input)
        guard result.status != .deleting else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM receipt_uploads WHERE actor=? AND household=?", lease.scope)
    }

    func finishAttachedReceipt(lease: OfflineLease) throws {
        guard let saved = try readReceiptUpload(lease: lease),
            let expense = try readExpense(lease: lease), expense.result?.status == .recorded,
            expense.command.expense.receiptPath == saved.input.path(household: lease.household)
        else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM receipt_uploads WHERE actor=? AND household=?", lease.scope)
    }

    private func saveReceiptUpload(_ saved: SavedReceiptUpload, lease: OfflineLease) throws {
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE receipt_uploads SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    private func receiptMember(_ lease: OfflineLease) -> VerifiedMember {
        .init(userId: lease.actor, householdId: lease.household, displayName: "")
    }
}
