import Foundation

extension NotificationAPI {
    func pushDevice(token: String, member: VerifiedMember, installation: UUID) async throws -> PushDeviceState {
        let result = try await http.read(
            "v1/push-devices/detail?installationId=\(installation.uuidString.lowercased())",
            token: token, household: member.householdId, responseLimit: 4096, as: PushDeviceState.self)
        return try result.validated(member: member, installation: installation)
    }

    func savePushDevice(token: String, member: VerifiedMember, command: PushDeviceCommand) async throws
        -> PushDeviceReceipt
    {
        _ = try command.validated()
        let result = try await http.write(
            "v1/push-devices/save", token: token, household: member.householdId,
            body: command, as: PushDeviceReceipt.self)
        return try result.validated(member: member, command: command)
    }

    func recoverPushDevice(
        token: String, member: VerifiedMember, command: PushDeviceCommand,
        cancel: Bool
    ) async throws -> PushDeviceRecovery {
        _ = try command.validated()
        let result: PushDeviceRecovery
        if cancel {
            result = try await http.write(
                "v1/push-devices/cancel", token: token, household: member.householdId,
                body: PushDeviceOperation(operationId: command.operationId), as: PushDeviceRecovery.self)
        } else {
            result = try await http.read(
                "v1/push-devices/operation?operationId=\(command.operationId.uuidString.lowercased())",
                token: token, household: member.householdId, responseLimit: 4096, as: PushDeviceRecovery.self)
        }
        _ = try result.validated(member: member, command: command)
        guard !cancel || result.status != .unresolved else { throw NestAPIFailure.contract }
        return result
    }
}

private struct PushDeviceOperation: Encodable { let operationId: UUID }
