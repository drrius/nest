import Foundation

struct SavedAssistantTurn: Codable, Equatable, Sendable {
    let command: StartAssistantTurn
    var result: AssistantTurnEnvelope?
    var terminal: Bool { result.map { $0.turn.state != .running } ?? false }

    func validated() throws -> Self {
        _ = try command.validated()
        _ = try result?.validated(command: command)
        return self
    }
}

extension ChoreOfflineStore {
    static func createAssistantRecoveryTable(_ db: SQLiteConnection) throws {
        try db.run(
            "CREATE TABLE IF NOT EXISTS assistant_turns (actor TEXT NOT NULL, household TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household))"
        )
    }

    func readAssistantTurn(lease: OfflineLease) throws -> SavedAssistantTurn? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM assistant_turns WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        return try JSONDecoder().decode(SavedAssistantTurn.self, from: data).validated()
    }

    /// Recovery record only. The chore/grocery outbox never sends assistant turns.
    func saveAssistantTurn(_ command: StartAssistantTurn, lease: OfflineLease) throws {
        guard try readAssistantTurn(lease: lease) == nil else { throw OfflineFailure.alreadyQueued }
        let saved = try SavedAssistantTurn(command: command, result: nil).validated()
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("INSERT INTO assistant_turns(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func recordAssistantTurn(_ result: AssistantTurnEnvelope, lease: OfflineLease) throws {
        guard var saved = try readAssistantTurn(lease: lease) else { throw OfflineFailure.invalidOperation }
        if saved.terminal {
            guard saved.result == result else { throw OfflineFailure.invalidOperation }
            return
        }
        if let previous = saved.result {
            guard previous.turn.assistantId == result.turn.assistantId,
                previous.turn.deadline == result.turn.deadline
            else { throw OfflineFailure.invalidOperation }
        }
        saved.result = result
        _ = try saved.validated()
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE assistant_turns SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    func finishAssistantTurn(operation: UUID, lease: OfflineLease) throws {
        guard let saved = try readAssistantTurn(lease: lease), saved.command.operationId == operation, saved.terminal
        else {
            throw OfflineFailure.invalidOperation
        }
        try db.run("DELETE FROM assistant_turns WHERE actor=? AND household=?", lease.scope)
    }
}
