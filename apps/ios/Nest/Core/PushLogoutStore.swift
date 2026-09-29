import Foundation

extension ChoreOfflineStore {
    static func createPushLogoutTable(_ db: SQLiteConnection) throws {
        try db.run(
            "CREATE TABLE IF NOT EXISTS push_logout_intents (actor TEXT NOT NULL, session TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,session))"
        )
        try db.run(
            "CREATE TABLE IF NOT EXISTS push_session_associations (actor TEXT NOT NULL, session TEXT NOT NULL, PRIMARY KEY(actor,session))"
        )
    }

    /// Call before enrollment can leave the device, including when its response may be lost.
    func trackPushSession(actor: UUID, session: UUID) throws {
        try db.run(
            "INSERT OR IGNORE INTO push_session_associations(actor,session) VALUES(?,?)",
            [actor.uuidString.lowercased(), session.uuidString.lowercased()])
    }

    func trackedPushSessions(actor: UUID) throws -> [UUID] {
        try db.rows(
            "SELECT session FROM push_session_associations WHERE actor=? ORDER BY session",
            [actor.uuidString.lowercased()]
        ).map { row in
            guard let value = row.first, let session = UUID(uuidString: value) else { throw OfflineFailure.storage }
            return session
        }
    }

    func hasPendingPushCleanup() throws -> Bool {
        !(try db.rows("SELECT 1 FROM push_logout_intents LIMIT 1")).isEmpty
    }

    /// Metadata only. Credentials remain in Keychain; cleanup survives membership loss and a deactivated lease.
    func pendingPushLogouts(actor: UUID) throws -> [PushLogoutIntent] {
        try db.rows(
            "SELECT session,body FROM push_logout_intents WHERE actor=? ORDER BY session",
            [actor.uuidString.lowercased()]
        )
        .map { row in
            guard row.count == 2, let data = row[1].data(using: .utf8) else { throw OfflineFailure.storage }
            let intent = try JSONDecoder().decode(PushLogoutIntent.self, from: data).validated()
            guard intent.actorId == actor, row[0] == intent.sessionId.uuidString.lowercased() else {
                throw OfflineFailure.storage
            }
            return intent
        }
    }

    func stagePushLogout(actor: UUID, session: UUID) throws {
        guard try pendingPushLogouts(actor: actor).allSatisfy({ $0.sessionId != session }) else { return }
        let intent = PushLogoutIntent(actorId: actor, sessionId: session, receipt: nil)
        let body = String(decoding: try JSONEncoder().encode(intent), as: UTF8.self)
        try db.run(
            "INSERT INTO push_logout_intents(actor,session,body) VALUES(?,?,?)", pushLogoutScope(intent) + [body])
    }

    func recordPushLogout(_ receipt: PushSessionRevocation) throws {
        guard
            var intent = try pendingPushLogouts(actor: receipt.actorId).first(where: {
                $0.sessionId == receipt.sessionId
            })
        else { throw OfflineFailure.invalidOperation }
        _ = try receipt.validated(actor: intent.actorId, session: intent.sessionId)
        if let prior = intent.receipt { guard prior == receipt else { throw OfflineFailure.invalidOperation } }
        intent.receipt = receipt
        let body = String(decoding: try JSONEncoder().encode(intent), as: UTF8.self)
        try db.run(
            "UPDATE push_logout_intents SET body=? WHERE actor=? AND session=?", [body] + pushLogoutScope(intent))
    }

    /// Call only after Auth confirms its protected credentials are removed. Pending revocation cannot be discarded.
    func finishPushLogout(actor: UUID, session: UUID) throws {
        guard let intent = try pendingPushLogouts(actor: actor).first(where: { $0.sessionId == session }),
            intent.receipt != nil
        else { throw OfflineFailure.invalidOperation }
        try db.transaction {
            try db.run("DELETE FROM push_logout_intents WHERE actor=? AND session=?", pushLogoutScope(intent))
            try db.run("DELETE FROM push_session_associations WHERE actor=? AND session=?", pushLogoutScope(intent))
        }
    }

    private func pushLogoutScope(_ intent: PushLogoutIntent) -> [String] {
        [intent.actorId.uuidString.lowercased(), intent.sessionId.uuidString.lowercased()]
    }
}
