import Foundation
import XCTest

@testable import NestCore

final class LegacyAdoptionTests: XCTestCase {
    private func fixture() throws -> [String: Any] {
        let url = try XCTUnwrap(
            Bundle.module.url(forResource: "legacy-adoption", withExtension: "json", subdirectory: "Fixtures"))
        return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
    }
    private func decode<T: Decodable>(_ raw: Any, as type: T.Type) throws -> T {
        try JSONDecoder().decode(type, from: JSONSerialization.data(withJSONObject: raw))
    }
    private func receipt() throws -> LegacyAdoptionReceipt {
        try decode(XCTUnwrap(fixture()["receipt"]), as: LegacyAdoptionReceipt.self)
    }
    private func member(_ receipt: LegacyAdoptionReceipt) -> VerifiedMember {
        .init(userId: receipt.actorId, householdId: receipt.householdId, displayName: "Alex")
    }
    private func balance(_ receipt: LegacyAdoptionReceipt) throws -> MoneyBalance {
        .init(
            version: 1, householdId: receipt.householdId, eventCount: "0", openingEstablished: false,
            members: try XCTUnwrap(receipt.input.configuration.allocations).map {
                .init(actorId: $0.memberId, displayName: "Member", centimes: try! Centimes("0"))
            })
    }

    func testGoldenRoundTripRetainsOldAmountScheduleAndNullableFieldsSeparatelyFromConsent() throws {
        let raw = try fixture()
        let context = try decode(XCTUnwrap(raw["context"]), as: LegacyAdoptionContext.self)
        let command = try decode(XCTUnwrap(raw["command"]), as: SaveLegacyAdoption.self)
        let receipt = try receipt()
        let recovery = try decode(XCTUnwrap(raw["recovery"]), as: LegacyAdoptionRecovery.self)
        _ = try context.validated(member: member(receipt), ruleId: command.input.ruleId)
        _ = try receipt.validated(member: member(receipt), command: command, review: context)
        _ = try recovery.validated(member: member(receipt), command: command)
        for (key, data) in [
            ("context", try JSONEncoder().encode(context)), ("command", try JSONEncoder().encode(command)),
            ("receipt", try JSONEncoder().encode(receipt)), ("recovery", try JSONEncoder().encode(recovery)),
        ] {
            XCTAssertEqual(
                try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? NSDictionary),
                try XCTUnwrap(raw[key] as? NSDictionary), key)
        }
        XCTAssertEqual(context.rule.amountCentimes.value, 9_007_199_254_740_991)
        XCTAssertTrue(context.rule.active)
        XCTAssertEqual(context.rule.schedule.kind, .weekly)
        XCTAssertEqual(command.input.configuration.amountCentimes?.value, 101)
        XCTAssertEqual(command.input.configuration.schedule.kind, .monthly)
    }

    func testBlockerCountsAdoptionAndUnsupportedCoverageMustBeConsistent() throws {
        let receipt = try receipt()
        let raw = try XCTUnwrap(fixture()["context"] as? [String: Any])
        for blockers in [
            ["pending_drafts"], ["unreconciled_history"], ["already_adopted"],
            ["unsupported_history_dates"], ["native_identity_in_use", "native_identity_in_use"],
        ] {
            var changed = raw
            changed["blockers"] = blockers
            let context = try decode(changed, as: LegacyAdoptionContext.self)
            XCTAssertThrowsError(try context.validated(member: member(receipt), ruleId: receipt.input.ruleId))
        }
        var changed = raw
        changed["blockers"] = ["native_identity_in_use"]
        let context = try decode(changed, as: LegacyAdoptionContext.self)
        _ = try context.validated(member: member(receipt), ruleId: receipt.input.ruleId)
        XCTAssertFalse(context.canAdopt)
        let command = SaveLegacyAdoption(operationId: receipt.operationId, input: receipt.input)
        let blockedReceipt = LegacyAdoptionReceipt(
            version: 1, actorId: receipt.actorId,
            householdId: receipt.householdId, operationId: receipt.operationId, approvalId: nil,
            input: receipt.input, reviewed: context, revision: receipt.revision, status: "active")
        XCTAssertThrowsError(try blockedReceipt.validated(member: member(receipt), command: command))
    }

    func testFreshConsentBindsCurrentPeopleTodayAndExactFirstUncoveredDate() throws {
        let receipt = try receipt()
        let owner = member(receipt)
        let balance = try balance(receipt)
        _ = try receipt.input.validated(
            member: owner, balance: balance, review: receipt.reviewed,
            today: CivilDate("2026-10-03"))
        XCTAssertThrowsError(
            try receipt.input.validated(
                member: owner, balance: balance, review: receipt.reviewed,
                today: CivilDate("2026-10-04")))
        for date in ["2026-10-06", "2026-11-05", "2026-09-05"] {
            let input = LegacyAdoptionInput(
                ruleId: receipt.input.ruleId, reviewToken: receipt.input.reviewToken,
                configuration: receipt.input.configuration, firstDueOn: try CivilDate(date))
            XCTAssertThrowsError(
                try input.validated(
                    member: owner, balance: balance, review: receipt.reviewed,
                    today: CivilDate("2026-10-03")))
        }
        var people = balance.members
        people[1] = .init(actorId: UUID(), displayName: "New member", centimes: try Centimes("0"))
        let replacement = MoneyBalance(
            version: 1, householdId: owner.householdId, eventCount: "0",
            openingEstablished: false, members: people)
        XCTAssertThrowsError(
            try receipt.input.validated(
                member: owner, balance: replacement, review: receipt.reviewed,
                today: CivilDate("2026-10-03")))
        let covered = LegacyAdoptionContext(
            version: 1, householdId: owner.householdId, rule: receipt.reviewed.rule,
            reviewToken: receipt.reviewed.reviewToken, coveredThrough: try CivilDate("2026-10-05"), blockers: [],
            adoption: nil)
        XCTAssertThrowsError(
            try receipt.input.validated(
                member: owner, balance: balance, review: covered,
                today: CivilDate("2026-10-03")))
    }

    func testReceiptRefusesOwnerOperationApprovalOrOriginalTermSubstitution() throws {
        let receipt = try receipt()
        let command = SaveLegacyAdoption(operationId: receipt.operationId, input: receipt.input)
        let raw = try XCTUnwrap(fixture()["receipt"] as? [String: Any])
        for key in ["actorId", "householdId", "operationId", "approvalId"] {
            var changed = raw
            changed[key] = UUID().uuidString
            let value = try decode(changed, as: LegacyAdoptionReceipt.self)
            XCTAssertThrowsError(try value.validated(member: member(receipt), command: command))
        }
        var reviewed = try XCTUnwrap(raw["reviewed"] as? [String: Any])
        var rule = try XCTUnwrap(reviewed["rule"] as? [String: Any])
        rule["description"] = "Changed original terms"
        reviewed["rule"] = rule
        var changed = raw
        changed["reviewed"] = reviewed
        let value = try decode(changed, as: LegacyAdoptionReceipt.self)
        XCTAssertThrowsError(try value.validated(member: member(receipt), command: command, review: receipt.reviewed))
    }

    func testSavedConsentAndCancellationSurviveRestartWhileAccountsAndTerminalReceiptsStayIsolated() async throws {
        let receipt = try receipt()
        let owner = member(receipt)
        let command = SaveLegacyAdoption(operationId: receipt.operationId, input: receipt.input)
        let url = FileManager.default.temporaryDirectory.appending(path: "legacy-adoption-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let first = try ChoreOfflineStore(url: url)
        let lease = try await first.activate(owner)
        try await first.enqueueLegacyAdoption(command, reviewed: receipt.reviewed, lease: lease)
        do {
            try await first.finishLegacyAdoption(operation: command.operationId, lease: lease)
            XCTFail("Erased unknown outcome")
        } catch OfflineFailure.invalidOperation {}
        try await first.requestLegacyAdoptionCancellation(lease: lease)
        let reopened = try ChoreOfflineStore(url: url)
        let other = try await reopened.activate(
            .init(userId: UUID(), householdId: owner.householdId, displayName: "Other"))
        let hidden = try await reopened.readLegacyAdoption(lease: other)
        XCTAssertNil(hidden)
        let restored = try await reopened.activate(owner)
        let pending = try await reopened.readLegacyAdoption(lease: restored)
        XCTAssertEqual(pending?.command, command)
        XCTAssertEqual(pending?.reviewed, receipt.reviewed)
        XCTAssertTrue(pending?.cancellationRequested == true)
        let recorded = LegacyAdoptionRecovery(
            version: 1, actorId: owner.userId, householdId: owner.householdId,
            operationId: command.operationId, status: .recorded, receipt: receipt)
        try await reopened.reconcileLegacyAdoption(recorded, lease: restored)
        var raw = try XCTUnwrap(fixture()["receipt"] as? [String: Any])
        raw["revision"] = UUID().uuidString
        let changed = try decode(raw, as: LegacyAdoptionReceipt.self)
        do {
            try await reopened.reconcileLegacyAdoption(
                .init(
                    version: 1, actorId: owner.userId,
                    householdId: owner.householdId, operationId: command.operationId, status: .recorded,
                    receipt: changed), lease: restored)
            XCTFail("Replaced a recorded revision")
        } catch OfflineFailure.invalidOperation {}
        do {
            try await reopened.reconcileLegacyAdoption(
                .init(
                    version: 1, actorId: owner.userId,
                    householdId: owner.householdId, operationId: command.operationId, status: .cancelled, receipt: nil),
                lease: restored)
            XCTFail("Cancelled an already recorded adoption")
        } catch OfflineFailure.invalidOperation {}
        try await reopened.finishLegacyAdoption(operation: command.operationId, lease: restored)
    }
}
