import Foundation

@testable import NestCore

enum PushRegistrationFixtures {
    static func id(_ n: Int) -> UUID { UUID(uuidString: String(format: "00000000-0000-4000-8000-%012d", n))! }
    static let member = VerifiedMember(userId: id(1), householdId: id(10), displayName: "Fictional")
    static let command = PushDeviceCommand(
        operationId: id(2700), installationId: id(2701),
        expectedRevision: nil, action: .register, token: "a1b2c3", environment: .sandbox)
    static let baseline = PushDeviceState(
        version: 1, actorId: member.userId, householdId: member.householdId,
        installationId: command.installationId, revision: nil, enabled: false, provider: nil, environment: nil)

    static func receipt(command: PushDeviceCommand = command) throws -> PushDeviceReceipt {
        .init(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, installationId: command.installationId,
            expectedRevision: command.expectedRevision, revision: id(2702), action: command.action,
            commandDigest: try command.digest(member: member))
    }

    static func recovery(_ status: PushDeviceRecovery.Status, command: PushDeviceCommand = command) throws
        -> PushDeviceRecovery
    {
        .init(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, status: status,
            receipt: status == .recorded ? try receipt(command: command) : nil)
    }

    static func replace<Value: Codable>(_ value: Value, patch: [String: Any]) throws -> Value {
        var object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(value)) as! [String: Any]
        object.merge(patch) { _, new in new }
        return try JSONDecoder().decode(Value.self, from: JSONSerialization.data(withJSONObject: object))
    }
}
