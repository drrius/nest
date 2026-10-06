import XCTest

extension NativeActiveRecurringReminderSaveTests {
    func requireRecordedIdentity() throws {
        let env = ProcessInfo.processInfo.environment
        let operation = try XCTUnwrap(UUID(uuidString: try XCTUnwrap(env["NEST_QA_ACTIVE_BILL_REMINDER_OPERATION_ID"])))
        let raw = try XCTUnwrap(env["NEST_QA_ACTIVE_BILL_REMINDER_REQUEST_JSON"])
        let saved = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(raw.utf8)) as? [String: Any])
        let command = try XCTUnwrap(saved["command"] as? [String: Any])
        let baseline = try XCTUnwrap(saved["baseline"] as? [String: Any])
        let rule = try XCTUnwrap(baseline["rule"] as? [String: Any])
        let result = try XCTUnwrap(saved["result"] as? [String: Any])
        let receipt = try XCTUnwrap(result["receipt"] as? [String: Any])
        XCTAssertEqual(UUID(uuidString: try XCTUnwrap(command["operationId"] as? String)), operation)
        XCTAssertEqual((command["ruleId"] as? String)?.lowercased(), env["NEST_QA_ACTIVE_BILL_RULE_ID"])
        XCTAssertEqual((rule["ruleId"] as? String)?.lowercased(), env["NEST_QA_ACTIVE_BILL_RULE_ID"])
        XCTAssertEqual((command["expectedRuleRevision"] as? String)?.lowercased(), env["NEST_QA_ACTIVE_BILL_REVISION"])
        XCTAssertEqual(command["expectedDueOn"] as? String, "2026-11-01")
        XCTAssertTrue(command["expectedRevision"] is NSNull)
        XCTAssertNil(baseline["reminder"])
        XCTAssertEqual(result["status"] as? String, "recorded")
        XCTAssertEqual((rule["revision"] as? String)?.lowercased(), env["NEST_QA_ACTIVE_BILL_REVISION"])
        XCTAssertEqual((baseline["householdId"] as? String)?.lowercased(), "be772ffd-3ab5-41d5-8438-647a79a553da")
        for envelope in [result, receipt] {
            XCTAssertEqual((envelope["actorId"] as? String)?.lowercased(), "791f7261-6c9d-4061-9c8a-57aa6e0b0200")
            XCTAssertEqual((envelope["householdId"] as? String)?.lowercased(), "be772ffd-3ab5-41d5-8438-647a79a553da")
            XCTAssertEqual(UUID(uuidString: try XCTUnwrap(envelope["operationId"] as? String)), operation)
        }
        let receiptCommand = try XCTUnwrap(receipt["command"] as? [String: Any])
        XCTAssertTrue(NSDictionary(dictionary: receiptCommand).isEqual(to: command))
        try recordedSettings(
            command: command, receipt: receipt, revision: try XCTUnwrap(env["NEST_QA_ACTIVE_BILL_REVISION"]))
        XCTAssertEqual(saved["cancellationRequested"] as? Bool, false)
        attach(
            ["operationId": operation.uuidString, "knownRecordedRequestValidated": true], name: "Exact Done identity")
    }

    private func recordedSettings(command: [String: Any], receipt: [String: Any], revision: String) throws {
        let settings = try XCTUnwrap(command["settings"] as? [String: Any])
        let recipients = try XCTUnwrap(settings["recipientIds"] as? [String])
        XCTAssertEqual(settings["enabled"] as? Bool, true)
        XCTAssertEqual(recipients.count, 2)
        XCTAssertEqual(
            Set(recipients.map { $0.lowercased() }),
            Set([
                "791f7261-6c9d-4061-9c8a-57aa6e0b0200", "e5f80cfd-b69a-4aa0-a267-75784e943676",
            ]))
        XCTAssertEqual(settings["localTime"] as? String, "09:00")
        XCTAssertEqual(settings["daysBefore"] as? Int, 1)
        let reminder = try XCTUnwrap(receipt["reminder"] as? [String: Any])
        XCTAssertTrue(
            NSDictionary(dictionary: try XCTUnwrap(reminder["settings"] as? [String: Any])).isEqual(to: settings))
        XCTAssertEqual((reminder["updatedBy"] as? String)?.lowercased(), "791f7261-6c9d-4061-9c8a-57aa6e0b0200")
        XCTAssertEqual((reminder["reviewedRuleRevision"] as? String)?.lowercased(), revision)
        XCTAssertEqual(reminder["reviewedDueOn"] as? String, "2026-11-01")
    }

}
