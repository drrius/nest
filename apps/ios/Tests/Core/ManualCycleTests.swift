import Foundation
import XCTest

@testable import NestCore

final class ManualCycleTests: XCTestCase {
    private func receipt() throws -> ManualCycleReceipt {
        let url = try XCTUnwrap(
            Bundle.module.url(forResource: "manual-cycle-receipt", withExtension: "json", subdirectory: "Fixtures"))
        return try JSONDecoder().decode(ManualCycleReceipt.self, from: Data(contentsOf: url))
    }

    func testExistingExpenseMayDifferFromTheRuleButMustBindTheExactCycleAndOwner() throws {
        let receipt = try receipt()
        let member = VerifiedMember(userId: receipt.actorId, householdId: receipt.householdId, displayName: "Alex")
        let command = SaveManualCycle(operationId: receipt.operationId, input: receipt.input)
        _ = try receipt.validated(member: member, command: command)
        XCTAssertEqual(receipt.linkedExpense.event.amountCentimes.value, 101)
        XCTAssertEqual(receipt.configuration.amountCentimes?.value, 990)
        XCTAssertNotEqual(receipt.linkedExpense.event.payerId, receipt.configuration.payerId)
        let data = try JSONEncoder().encode(receipt)
        let root = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        for key in ["actorId", "householdId", "operationId", "approvalId", "eventId", "source"] {
            var changed = root
            changed[key] = UUID().uuidString
            let decoded = try JSONDecoder().decode(
                ManualCycleReceipt.self, from: JSONSerialization.data(withJSONObject: changed))
            XCTAssertThrowsError(try decoded.validated(member: member, command: command), key)
        }
        for (section, field, value) in [
            ("input", "sourceEventId", UUID().uuidString),
            ("input", "expectedRevision", UUID().uuidString),
            ("cycle", "through", "2026-11-01"),
            ("linkedExpense", "reversedById", UUID().uuidString),
            ("linkedExpense", "householdId", UUID().uuidString),
        ] {
            var nested = try XCTUnwrap(root[section] as? [String: Any])
            nested[field] = value
            var changed = root
            changed[section] = nested
            let decoded = try JSONDecoder().decode(
                ManualCycleReceipt.self, from: JSONSerialization.data(withJSONObject: changed))
            XCTAssertThrowsError(try decoded.validated(member: member, command: command), field)
        }
    }

    func testFreshLinkRequiresCurrentDueRevisionCoverageAndBothCurrentPeople() throws {
        let receipt = try receipt()
        let member = VerifiedMember(userId: receipt.actorId, householdId: receipt.householdId, displayName: "Alex")
        let people = try receipt.linkedExpense.shares.map {
            MoneyBalance.Member(actorId: $0.id, displayName: "Fixture", centimes: try Centimes("0"))
        }
        let balance = MoneyBalance(
            version: 1, householdId: member.householdId, eventCount: "1", openingEstablished: false, members: people)
        for mode in [RecurringConfiguration.Mode.fixed, .variable] {
            let config = RecurringConfiguration(
                description: receipt.configuration.description, payerId: receipt.configuration.payerId,
                categoryId: nil, note: nil, startDate: receipt.configuration.startDate,
                schedule: receipt.configuration.schedule, mode: mode,
                amountCentimes: mode == .fixed ? receipt.configuration.amountCentimes : nil,
                allocations: mode == .fixed ? receipt.configuration.allocations : nil)
            for fault in ["none", "revision", "covered", "paused", "cancelled", "future", "foreign"] {
                let rule = RecurringRule(
                    ruleId: receipt.input.ruleId,
                    revision: fault == "revision" ? UUID() : receipt.input.expectedRevision,
                    configuration: config,
                    status: fault == "paused" ? .paused : fault == "cancelled" ? .cancelled : .active,
                    authorizedBy: member.userId, authorizedAt: "2026-10-01T00:00:00.000000Z",
                    coveredThrough: fault == "covered" ? receipt.cycle.through : nil,
                    nextDueOn: receipt.input.dueOn)
                let target = RecurringDetail(
                    version: 1, householdId: member.householdId,
                    today: try CivilDate(fault == "future" ? "2026-09-30" : "2026-10-01"), rule: rule)
                let current =
                    fault == "foreign"
                    ? MoneyBalance(
                        version: 1, householdId: member.householdId, eventCount: "1", openingEstablished: false,
                        members: [people[0], .init(actorId: UUID(), displayName: "Other", centimes: try Centimes("0"))])
                    : balance
                if fault == "none" {
                    try receipt.input.validated(
                        member: member, balance: current, target: target, source: receipt.linkedExpense)
                } else {
                    XCTAssertThrowsError(
                        try receipt.input.validated(
                            member: member, balance: current, target: target, source: receipt.linkedExpense), fault)
                }
            }
        }
    }

    func testExactSavedLinkSurvivesRestartAndCancellationCannotEraseARecordedResult() async throws {
        let receipt = try receipt()
        let member = VerifiedMember(userId: receipt.actorId, householdId: receipt.householdId, displayName: "Alex")
        let command = SaveManualCycle(operationId: receipt.operationId, input: receipt.input)
        let url = FileManager.default.temporaryDirectory.appending(path: "manual-link-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let first = try ChoreOfflineStore(url: url)
        let lease = try await first.activate(member)
        try await first.enqueueManualCycle(command, lease: lease)
        do {
            try await first.finishManualCycle(operation: command.operationId, lease: lease)
            XCTFail("Discarded unresolved link")
        } catch OfflineFailure.invalidOperation {}
        try await first.requestManualCycleCancellation(lease: lease)
        let reopened = try ChoreOfflineStore(url: url)
        let active = try await reopened.activate(member)
        let saved = try await reopened.readManualCycle(lease: active)
        XCTAssertEqual(saved?.command, command)
        XCTAssertTrue(saved?.cancellationRequested == true)
        let other = try await reopened.activate(
            .init(userId: UUID(), householdId: member.householdId, displayName: "Other"))
        let hidden = try await reopened.readManualCycle(lease: other)
        XCTAssertNil(hidden)
        let restored = try await reopened.activate(member)
        try await reopened.confirmManualCycle(receipt, lease: restored)
        let recorded = try await reopened.readManualCycle(lease: restored)
        XCTAssertEqual(recorded?.result?.status, .recorded)
        do {
            try await reopened.confirmManualCycle(renamed(receipt), lease: restored)
            XCTFail("Changed immutable receipt terms")
        } catch OfflineFailure.invalidOperation {}
        do {
            try await reopened.reconcileManualCycle(
                .init(
                    version: 1, actorId: member.userId, householdId: member.householdId,
                    operationId: command.operationId, status: .cancelled, receipt: nil), lease: restored)
            XCTFail("Cancellation erased a recorded link")
        } catch OfflineFailure.invalidOperation {}
        try await reopened.finishManualCycle(operation: command.operationId, lease: restored)
        let cleared = try await reopened.readManualCycle(lease: restored)
        XCTAssertNil(cleared)
    }
    private func renamed(_ receipt: ManualCycleReceipt) throws -> ManualCycleReceipt {
        let data = try JSONEncoder().encode(receipt)
        var root = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        var configuration = try XCTUnwrap(root["configuration"] as? [String: Any])
        configuration["description"] = "Changed immutable rule snapshot"
        root["configuration"] = configuration
        return try JSONDecoder().decode(ManualCycleReceipt.self, from: JSONSerialization.data(withJSONObject: root))
    }

}
