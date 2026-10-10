import CryptoKit
import Foundation

enum PushEnvironment: String, Codable, Sendable { case sandbox, production }

struct PushDeviceCommand: Codable, Equatable, Sendable, CustomStringConvertible, CustomDebugStringConvertible {
    enum Action: String, Codable, Sendable { case register, disable }
    let operationId: UUID
    let installationId: UUID
    let expectedRevision: UUID?
    let action: Action
    let token: String?
    let environment: PushEnvironment?

    var description: String { "Push device command (redacted)" }
    var debugDescription: String { description }

    func validated() throws -> Self {
        switch action {
        case .register:
            guard let token, environment != nil,
                token.range(of: #"\A(?:[0-9a-f]{2}){1,2048}\z"#, options: .regularExpression) != nil
            else { throw NestAPIFailure.invalid }
        case .disable:
            guard token == nil, environment == nil else { throw NestAPIFailure.invalid }
        }
        return self
    }

    static func tokenBytes(_ bytes: Data) throws -> String {
        guard (1...2048).contains(bytes.count) else { throw NestAPIFailure.invalid }
        return bytes.map { String(format: "%02x", $0) }.joined()
    }

    func digest(member: VerifiedMember) throws -> String {
        _ = try validated()
        var fields = [
            action == .register ? "nest-push-device/apns-v1" : "nest-push-device/v1",
            member.userId.uuidString.lowercased(), member.householdId.uuidString.lowercased(),
            operationId.uuidString.lowercased(), installationId.uuidString.lowercased(),
            expectedRevision?.uuidString.lowercased() ?? "", action.rawValue, token ?? "",
        ]
        if let environment { fields += ["apns", environment.rawValue] }
        return SHA256.hash(data: Data(fields.joined(separator: "\n").utf8))
            .map { String(format: "%02x", $0) }.joined()
    }

    private enum CodingKeys: String, CodingKey {
        case operationId, installationId, expectedRevision, action, token, provider, environment
    }

    init(
        operationId: UUID, installationId: UUID, expectedRevision: UUID?, action: Action,
        token: String? = nil, environment: PushEnvironment? = nil
    ) {
        self.operationId = operationId
        self.installationId = installationId
        self.expectedRevision = expectedRevision
        self.action = action
        self.token = token
        self.environment = environment
    }

    init(from decoder: any Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        guard values.contains(.expectedRevision) else { throw NestAPIFailure.contract }
        operationId = try values.decode(UUID.self, forKey: .operationId)
        installationId = try values.decode(UUID.self, forKey: .installationId)
        expectedRevision = try values.decodeIfPresent(UUID.self, forKey: .expectedRevision)
        action = try values.decode(Action.self, forKey: .action)
        token = try values.decodeIfPresent(String.self, forKey: .token)
        environment = try values.decodeIfPresent(PushEnvironment.self, forKey: .environment)
        if action == .register {
            guard try values.decode(String.self, forKey: .provider) == "apns" else { throw NestAPIFailure.contract }
        } else {
            guard !values.contains(.provider), !values.contains(.token), !values.contains(.environment) else {
                throw NestAPIFailure.contract
            }
        }
        _ = try validated()
    }

    func encode(to encoder: any Encoder) throws {
        _ = try validated()
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(operationId.uuidString.lowercased(), forKey: .operationId)
        try values.encode(installationId.uuidString.lowercased(), forKey: .installationId)
        try values.encode(expectedRevision?.uuidString.lowercased(), forKey: .expectedRevision)
        try values.encode(action, forKey: .action)
        if action == .register {
            try values.encode("apns", forKey: .provider)
            try values.encode(token, forKey: .token)
            try values.encode(environment, forKey: .environment)
        }
    }
}
