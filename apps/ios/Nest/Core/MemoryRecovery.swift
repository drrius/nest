import Foundation

enum MemoryRequest: Codable, Sendable {
    case proposal(ProposeMemory)
    case decision(DecideMemory)
    case removal(RemoveMemory)

    var operation: UUID {
        switch self {
        case .proposal(let command): command.operationId
        case .decision(let command): command.operationId
        case .removal(let command): command.operationId
        }
    }

    func validate() throws {
        switch self {
        case .proposal(let command): _ = try command.change.validated()
        case .decision(let command):
            _ = try MemoryChange(
                memoryId: command.memoryId, expectedRevision: command.expectedRevision, content: command.content
            ).validated()
        case .removal(let command):
            guard MealRevision.valid(command.expectedRevision), command.expectedRevision != "0" else {
                throw OfflineFailure.invalidOperation
            }
        }
    }
}

enum MemoryResponse: Codable, Sendable {
    case proposal(MemoryApprovalEnvelope)
    case decision(MemoryDecisionEnvelope)
    case removal(MemoryRemovalEnvelope)

    func validate(request: MemoryRequest, member: VerifiedMember) throws {
        switch (request, self) {
        case (.proposal(let command), .proposal(let result)):
            _ = try result.validated(member: member, id: result.approval.id)
            guard result.approval.operationId == command.operationId, result.approval.change == command.change else {
                throw OfflineFailure.invalidOperation
            }
        case (.decision(let command), .decision(let result)):
            _ = try result.validated(member: member, command: command)
        case (.removal(let command), .removal(let result)):
            _ = try result.validated(member: member, command: command)
        default: throw OfflineFailure.invalidOperation
        }
    }
}

struct SavedMemoryRequest: Codable, Sendable {
    let request: MemoryRequest
    var response: MemoryResponse?
    var rejected = false

    var approvalId: UUID? {
        if case .proposal(let envelope) = response { return envelope.approval.id }
        if case .decision(let command) = request { return command.approvalId }
        return nil
    }

    func validated(lease: OfflineLease) throws -> Self {
        guard !rejected || response == nil else { throw OfflineFailure.storage }
        try request.validate()
        try response?.validate(
            request: request,
            member: VerifiedMember(userId: lease.actor, householdId: lease.household, displayName: ""))
        return self
    }
}

extension ChoreOfflineStore {
    static func createMemoryRecoveryTable(_ db: SQLiteConnection) throws {
        try db.run(
            "CREATE TABLE IF NOT EXISTS memory_requests (actor TEXT NOT NULL, household TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household))"
        )
    }

    func readMemoryRequest(lease: OfflineLease) throws -> SavedMemoryRequest? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM memory_requests WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        return try JSONDecoder().decode(SavedMemoryRequest.self, from: data).validated(lease: lease)
    }

    /// Keeps uncertain online requests out of the automatic offline outbox.
    func stageMemoryRequest(_ request: MemoryRequest, lease: OfflineLease) throws {
        guard try readMemoryRequest(lease: lease) == nil else { throw OfflineFailure.alreadyQueued }
        let saved = try SavedMemoryRequest(request: request).validated(lease: lease)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("INSERT INTO memory_requests(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func recordMemoryResponse(_ response: MemoryResponse, lease: OfflineLease) throws {
        guard var saved = try readMemoryRequest(lease: lease), saved.response == nil, !saved.rejected else {
            throw OfflineFailure.invalidOperation
        }
        saved.response = response
        try writeMemoryRequest(saved, lease: lease)
    }

    func importMemoryProposal(_ envelope: MemoryApprovalEnvelope, lease: OfflineLease) throws {
        guard try readMemoryRequest(lease: lease) == nil else { throw OfflineFailure.alreadyQueued }
        let approval = envelope.approval
        let command = ProposeMemory(
            operationId: approval.operationId, memoryId: approval.change.memoryId,
            expectedRevision: approval.change.expectedRevision, content: approval.change.content)
        let saved = try SavedMemoryRequest(request: .proposal(command), response: .proposal(envelope))
            .validated(lease: lease)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("INSERT INTO memory_requests(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func refreshMemoryProposal(_ envelope: MemoryApprovalEnvelope, lease: OfflineLease) throws {
        guard var saved = try readMemoryRequest(lease: lease), case .proposal = saved.request,
            case .proposal(let previous) = saved.response,
            envelope.approval.hasSameTerms(as: previous.approval)
        else { throw OfflineFailure.invalidOperation }
        saved.response = .proposal(envelope)
        try writeMemoryRequest(saved, lease: lease)
    }

    /// A fresh, exact proposal is only a draft. Consent starts a separate decision.
    func decideSavedMemoryProposal(
        approved: Bool, approval: MemoryApprovalEnvelope, lease: OfflineLease
    ) throws {
        guard let saved = try readMemoryRequest(lease: lease),
            case .proposal(let envelope) = saved.response,
            approval.approval.hasSameTerms(as: envelope.approval), approval.approval.canDecide()
        else { throw OfflineFailure.invalidOperation }
        try MemoryResponse.proposal(approval).validate(
            request: saved.request,
            member: VerifiedMember(userId: lease.actor, householdId: lease.household, displayName: ""))
        let command = DecideMemory(approval: envelope.approval, approved: approved)
        try writeMemoryRequest(SavedMemoryRequest(request: .decision(command)), lease: lease)
    }

    func rejectMemoryRequest(operation: UUID, lease: OfflineLease) throws {
        guard var saved = try readMemoryRequest(lease: lease), saved.request.operation == operation,
            saved.response == nil
        else { throw OfflineFailure.invalidOperation }
        saved.rejected = true
        try writeMemoryRequest(saved, lease: lease)
    }

    func finishMemoryRequest(operation: UUID, lease: OfflineLease) throws {
        guard let saved = try readMemoryRequest(lease: lease), saved.request.operation == operation,
            saved.response != nil || saved.rejected
        else { throw OfflineFailure.invalidOperation }
        if case .proposal(let envelope) = saved.response {
            guard [.denied, .consumed].contains(envelope.approval.status) || envelope.approval.isExpired() else {
                throw OfflineFailure.invalidOperation
            }
        }
        try db.run("DELETE FROM memory_requests WHERE actor=? AND household=?", lease.scope)
    }

    private func writeMemoryRequest(_ saved: SavedMemoryRequest, lease: OfflineLease) throws {
        _ = try saved.validated(lease: lease)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE memory_requests SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }
}
