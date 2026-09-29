import Foundation
import XCTest

@testable import NestCore

final class PushRegistrationTests: XCTestCase {
    private typealias F = PushRegistrationFixtures

    func testDecodingRejectsMissingBaselineProviderAndDisableTokenFields() throws {
        let encoded = try JSONEncoder().encode(F.command)
        let original = try JSONSerialization.jsonObject(with: encoded) as! [String: Any]
        for key in ["provider", "environment", "expectedRevision"] {
            var object = original
            object.removeValue(forKey: key)
            XCTAssertThrowsError(
                try JSONDecoder().decode(
                    PushDeviceCommand.self,
                    from: JSONSerialization.data(withJSONObject: object)))
        }
        for patch in [["provider": "expo"], ["environment": "prod"]] {
            var object = original
            object.merge(patch) { _, new in new }
            XCTAssertThrowsError(
                try JSONDecoder().decode(
                    PushDeviceCommand.self,
                    from: JSONSerialization.data(withJSONObject: object)))
        }
        let disabled = PushDeviceCommand(
            operationId: F.command.operationId, installationId: F.command.installationId,
            expectedRevision: nil, action: .disable)
        var object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(disabled)) as! [String: Any]
        object["token"] = NSNull()
        XCTAssertThrowsError(
            try JSONDecoder().decode(
                PushDeviceCommand.self,
                from: JSONSerialization.data(withJSONObject: object)))
    }

    func testAPNsBytesKeepLeadingZerosAndVariableLengthWithoutNormalizingText() throws {
        XCTAssertEqual(try PushDeviceCommand.tokenBytes(Data([0, 1, 16, 255])), "000110ff")
        for size in [1, 2, 32, 64, 2048] {
            let bytes = Data((0..<size).map { UInt8($0 % 256) })
            let token = try PushDeviceCommand.tokenBytes(bytes)
            XCTAssertEqual(token.count, size * 2)
            XCTAssertNoThrow(
                try PushDeviceCommand(
                    operationId: UUID(), installationId: UUID(),
                    expectedRevision: nil, action: .register, token: token, environment: .production
                ).validated())
        }
        for bytes in [Data(), Data(repeating: 0, count: 2049)] {
            XCTAssertThrowsError(try PushDeviceCommand.tokenBytes(bytes))
        }
        for token in ["", "a", "AABB", "aabb\n", " aabb", "aabb ", "ExpoPushToken[x]"] {
            XCTAssertThrowsError(
                try PushDeviceCommand(
                    operationId: UUID(), installationId: UUID(),
                    expectedRevision: nil, action: .register, token: token, environment: .sandbox
                ).validated())
        }
    }

    func testCommandWireAndDigestMatchTheServerIncludingExplicitNullAndDisableDomain() throws {
        let data = try JSONEncoder().encode(F.command)
        let object = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        XCTAssertEqual(object["provider"] as? String, "apns")
        XCTAssertEqual(object["environment"] as? String, "sandbox")
        XCTAssertTrue(object["expectedRevision"] is NSNull)
        XCTAssertEqual(object["operationId"] as? String, F.command.operationId.uuidString.lowercased())
        XCTAssertEqual(try JSONDecoder().decode(PushDeviceCommand.self, from: data), F.command)
        XCTAssertEqual(
            try F.command.digest(member: F.member), "30920c59123b1a61e0271d5b0f44410081fdb22d11e1600239a1c75115b2428e")
        let disabled = PushDeviceCommand(
            operationId: F.command.operationId, installationId: F.command.installationId,
            expectedRevision: nil, action: .disable)
        let body = try JSONSerialization.jsonObject(with: JSONEncoder().encode(disabled)) as! [String: Any]
        for key in ["provider", "environment", "token"] { XCTAssertNil(body[key]) }
        XCTAssertEqual(
            try disabled.digest(member: F.member), "a28c297b54934eb2dea74f47693b59b92ba936a906c2a67b2459a05998e78150")
        XCTAssertFalse(String(describing: F.command).contains(F.command.token!))
        XCTAssertFalse(String(reflecting: F.command).contains(F.command.token!))
    }

    func testReceiptsRejectActorHouseholdInstallationOperationRevisionTokenAndEnvironmentSubstitution() throws {
        let receipt = try F.receipt()
        XCTAssertNoThrow(try receipt.validated(member: F.member, command: F.command))
        let patches: [[String: Any]] = [
            ["actorId": F.id(2).uuidString], ["householdId": F.id(20).uuidString],
            ["installationId": F.id(99).uuidString], ["operationId": F.id(99).uuidString],
            ["expectedRevision": F.id(99).uuidString], ["action": "disable"], ["commandDigest": "a"], ["version": 2],
        ]
        for patch in patches {
            let changed = try F.replace(receipt, patch: patch)
            XCTAssertThrowsError(try changed.validated(member: F.member, command: F.command))
        }
        for command in [
            PushDeviceCommand(
                operationId: F.command.operationId, installationId: F.command.installationId,
                expectedRevision: nil, action: .register, token: "aabb", environment: .sandbox),
            PushDeviceCommand(
                operationId: F.command.operationId, installationId: F.command.installationId,
                expectedRevision: nil, action: .register, token: F.command.token, environment: .production),
        ] {
            XCTAssertThrowsError(try receipt.validated(member: F.member, command: command))
        }
    }

    func testReadAndRecoveryBindAccountEnvironmentAndTerminalEvidence() throws {
        XCTAssertNoThrow(try F.baseline.validated(member: F.member, installation: F.command.installationId))
        for patch in [
            ["enabled": true], ["provider": "apns"], ["environment": "sandbox"],
            ["actorId": F.id(2).uuidString], ["installationId": F.id(99).uuidString],
        ] as [[String: Any]] {
            let changed = try F.replace(F.baseline, patch: patch)
            XCTAssertThrowsError(try changed.validated(member: F.member, installation: F.command.installationId))
        }
        let pending = try F.recovery(.unresolved)
        XCTAssertNoThrow(try pending.validated(member: F.member, command: F.command))
        let invalid = try F.replace(pending, patch: ["status": "recorded"])
        XCTAssertThrowsError(try invalid.validated(member: F.member, command: F.command))
        let recorded = try F.recovery(.recorded)
        for patch in [["status": "cancelled"], ["operationId": F.id(99).uuidString]] {
            let changed = try F.replace(recorded, patch: patch)
            XCTAssertThrowsError(try changed.validated(member: F.member, command: F.command))
        }
    }
}
