import Foundation
import XCTest

@testable import NestCore

final class NestRequestDiagnosticsTests: XCTestCase {
    private let baseURL = URL(string: "https://nest.example/")!

    func testWriteAddsCorrelationHeadersAndExcludesPrivateContentFromReport() async throws {
        let diagnostics = NestRequestDiagnostics()
        let household = UUID()
        let token = "private-access-token"
        let client = try NestHTTP(baseURL: baseURL, diagnostics: diagnostics) { request in
            let requestId = request.value(forHTTPHeaderField: "X-Nest-Request-ID") ?? ""
            let traceparent = request.value(forHTTPHeaderField: "traceparent") ?? ""
            XCTAssertNotNil(UUID(uuidString: requestId))
            XCTAssertNotNil(traceparent.range(of: "^00-[0-9a-f]{32}-[0-9a-f]{16}-00$", options: .regularExpression))
            XCTAssertTrue(traceparent.hasPrefix("00-\(requestId.replacingOccurrences(of: "-", with: ""))-"))
            XCTAssertEqual(request.value(forHTTPHeaderField: "X-Nest-App-Version"), diagnostics.appVersion)
            XCTAssertEqual(request.value(forHTTPHeaderField: "X-Nest-App-Build"), diagnostics.appBuild)
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            let body = "{\"ok\":true,\"private\":\"private-response-content\"}"
            return (Data(body.utf8), response)
        }
        let result = try await client.write(
            "v1/money/expense/save?memberId=\(household)&note=private-query", token: token,
            household: household, body: ["note": "private-financial-description"], as: Reply.self)
        XCTAssertTrue(result.ok)
        let record = try XCTUnwrap(diagnostics.snapshot().first)
        XCTAssertEqual(record.route, .moneyExpense)
        XCTAssertEqual(record.method, "POST")
        XCTAssertEqual(record.status, 200)
        XCTAssertEqual(record.outcome, .success)
        XCTAssertGreaterThanOrEqual(record.durationMilliseconds, 0)
        XCTAssertTrue(
            record.traceparent.hasPrefix(
                "00-\(record.requestId.uuidString.lowercased().replacingOccurrences(of: "-", with: ""))-"))
        let report = try diagnostics.supportReport()
        for privateValue in [
            token, household.uuidString, "private-query", "private-financial-description", "private-response-content",
        ] {
            XCTAssertFalse(report.localizedCaseInsensitiveContains(privateValue))
        }
    }

    func testHTTPAndDecodeFailuresKeepTheirExistingErrorsAndDiagnosticCategories() async throws {
        let samples: [(Int, String, NestAPIFailure, NestRequestOutcome)] = [
            (401, "{}", .signedOut, .http),
            (403, "{\"error\":{\"code\":\"not_a_member\"}}", .notMember, .http),
            (409, "{\"error\":{\"code\":\"cutover\"}}", .cutover, .http),
            (409, "{\"error\":{\"code\":\"household_incomplete\"}}", .householdIncomplete, .householdIncomplete),
            (503, "private-server-error", .unavailable, .http),
            (200, "{\"ok\":\"private-invalid-value\"}", .contract, .decoding),
        ]
        for (status, body, expectedError, expectedOutcome) in samples {
            let diagnostics = NestRequestDiagnostics()
            let client = try NestHTTP(baseURL: baseURL, diagnostics: diagnostics) { request in
                let response = HTTPURLResponse(
                    url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
                return (Data(body.utf8), response)
            }
            do {
                _ = try await client.read("v1/money/balance", token: "test", as: Reply.self)
                XCTFail("Expected request failure")
            } catch { XCTAssertEqual(error as? NestAPIFailure, expectedError) }
            let record = try XCTUnwrap(diagnostics.snapshot().first)
            XCTAssertEqual(record.outcome, expectedOutcome)
            XCTAssertEqual(record.status, status)
            XCTAssertEqual(record.route, .moneyBalance)
            XCTAssertFalse(try diagnostics.supportReport().contains("private-"))
        }
    }

    func testTransportFailureClassifiesWithoutSerializingTheError() async throws {
        let samples: [(URLError.Code, NestRequestOutcome)] = [
            (.timedOut, .timeout), (.notConnectedToInternet, .offline), (.cancelled, .cancelled),
            (.cannotFindHost, .transport),
        ]
        for (code, expected) in samples {
            let diagnostics = NestRequestDiagnostics()
            let client = try NestHTTP(baseURL: baseURL, diagnostics: diagnostics) { _ in
                throw URLError(code, userInfo: [NSLocalizedDescriptionKey: "private-error-content"])
            }
            do {
                _ = try await client.read("v1/money/expense-context", token: "test", as: Reply.self)
                XCTFail("Expected unavailable")
            } catch { XCTAssertEqual(error as? NestAPIFailure, .unavailable) }
            let record = try XCTUnwrap(diagnostics.snapshot().first)
            XCTAssertEqual(record.outcome, expected)
            XCTAssertNil(record.status)
            XCTAssertEqual(record.route, .moneyExpenseContext)
            XCTAssertFalse(try diagnostics.supportReport().contains("private-error-content"))
        }
    }

    func testOversizedAndNonHTTPResponsesStayUnavailable() async throws {
        let diagnostics = NestRequestDiagnostics()
        let oversized = try NestHTTP(baseURL: baseURL, diagnostics: diagnostics) { request in
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (Data("{\"ok\":true}".utf8), response)
        }
        do {
            _ = try await oversized.read("v1/session", token: "test", responseLimit: 1, as: Reply.self)
            XCTFail("Expected unavailable")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .unavailable) }
        XCTAssertEqual(diagnostics.snapshot().last?.outcome, .responseSize)
        XCTAssertEqual(diagnostics.snapshot().last?.status, 200)
        let nonHTTP = try NestHTTP(baseURL: baseURL, diagnostics: diagnostics) { request in
            (Data(), URLResponse(url: request.url!, mimeType: nil, expectedContentLength: 0, textEncodingName: nil))
        }
        do {
            _ = try await nonHTTP.read("v1/session", token: "test", as: Reply.self)
            XCTFail("Expected unavailable")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .unavailable) }
        XCTAssertEqual(diagnostics.snapshot().last?.outcome, .response)
        XCTAssertNil(diagnostics.snapshot().last?.status)
    }

    func testStoreEvictsOldestRecordsAndCanClearSupportData() async throws {
        let diagnostics = NestRequestDiagnostics(capacity: 2)
        let client = try NestHTTP(baseURL: baseURL, diagnostics: diagnostics) { request in
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (Data("{\"ok\":true}".utf8), response)
        }
        for path in ["v1/session", "v1/money/balance", "v1/money/history"] {
            _ = try await client.read(path, token: "test", as: Reply.self)
        }
        let records = diagnostics.snapshot()
        XCTAssertEqual(records.map(\.route), [.moneyBalance, .moneyHistory])
        XCTAssertNotEqual(records[0].requestId, records[1].requestId)
        diagnostics.clear()
        XCTAssertTrue(diagnostics.snapshot().isEmpty)
        let cleared = try JSONDecoder().decode(
            [NestRequestDiagnostic].self, from: Data(diagnostics.supportReport().utf8))
        XCTAssertTrue(cleared.isEmpty)
    }

    func testRouteCategoriesDiscardDynamicIdentifiersAndQueries() {
        XCTAssertEqual(NestRequestRoute.category("v1/money/expense/private-record?description=private"), .moneyExpense)
        XCTAssertEqual(NestRequestRoute.category("v1/money/private-record?amount=1234"), .money)
        XCTAssertEqual(NestRequestRoute.category("v1/meals/private-title?calendar=private-event"), .meals)
        XCTAssertEqual(NestRequestRoute.category("v1/private-record?token=secret"), .unknown)
        XCTAssertEqual(NestRequestRoute.category("https://private.example/v1/money/balance"), .unknown)
    }

    private struct Reply: Decodable { let ok: Bool }
}
