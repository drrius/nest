import Foundation

struct RenewalAPI: Sendable {
    let http: NestHTTP

    func list(token: String, member: VerifiedMember, after: UUID?) async throws -> RenewalList {
        let query = after.map { "?after=\($0.uuidString.lowercased())" } ?? ""
        let result = try await http.read(
            "v1/renewals\(query)", token: token, household: member.householdId, as: RenewalList.self)
        return try result.validated(member: member, cursor: after)
    }

    func detail(token: String, member: VerifiedMember, id: UUID) async throws -> RenewalDetail {
        let result = try await http.read(
            "v1/renewals/detail?renewalId=\(id.uuidString.lowercased())", token: token,
            household: member.householdId, as: RenewalDetail.self)
        return try result.validated(member: member, id: id)
    }

    func change(token: String, member: VerifiedMember, command: RenewalCommand) async throws -> RenewalReceipt {
        _ = try command.validated()
        let path = command.removing ? "v1/renewals/remove" : "v1/renewals/save"
        let receipt = try await http.write(
            path, token: token, household: member.householdId, body: command, as: RenewalReceipt.self)
        return try receipt.validated(member: member, expected: command)
    }

    func recover(token: String, member: VerifiedMember, command: RenewalCommand, cancel: Bool) async throws
        -> RenewalRecovery
    {
        let result: RenewalRecovery
        if cancel {
            result = try await http.write(
                "v1/renewals/cancel-operation", token: token, household: member.householdId,
                body: RenewalOperation(operationId: command.operationId), as: RenewalRecovery.self)
        } else {
            result = try await http.read(
                "v1/renewals/operation?operationId=\(command.operationId.uuidString.lowercased())",
                token: token, household: member.householdId, as: RenewalRecovery.self)
        }
        let bound = try result.validated(member: member, command: command)
        guard !cancel || bound.status != .unresolved else { throw NestAPIFailure.contract }
        return bound
    }
}

private struct RenewalOperation: Encodable { let operationId: UUID }
