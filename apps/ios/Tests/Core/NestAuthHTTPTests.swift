import Foundation
import XCTest

@testable import NestCore

final class NestAuthHTTPTests: XCTestCase {
    func testFetchForwardsUnchangedRequestAndResponseWithoutPrivateDiagnosticContent() async throws {
        let diagnostics = NestRequestDiagnostics()
        let request = privateRequest()
        let body = Data("private-response-token".utf8)
        let response = HTTPURLResponse(
            url: request.url!, statusCode: 200, httpVersion: nil,
            headerFields: ["Set-Cookie": "private-response-cookie"])!
        let transport = NestAuthHTTP(diagnostics: diagnostics) { received in
            XCTAssertEqual(received, request)
            XCTAssertEqual(received.httpShouldHandleCookies, request.httpShouldHandleCookies)
            XCTAssertEqual(received.cachePolicy, request.cachePolicy)
            XCTAssertEqual(received.timeoutInterval, request.timeoutInterval)
            XCTAssertTrue(diagnostics.snapshot().isEmpty)
            return (body, response)
        }
        let returned = try await transport.fetch(request)
        XCTAssertEqual(returned.0, body)
        XCTAssertTrue(returned.1 === response)
        let record = try XCTUnwrap(diagnostics.snapshot().first)
        XCTAssertEqual(record.route, .auth)
        XCTAssertEqual(record.method, "POST")
        XCTAssertEqual(record.status, 200)
        XCTAssertEqual(record.outcome, .success)
        XCTAssertGreaterThanOrEqual(record.durationMilliseconds, 0)
        XCTAssertFalse(try diagnostics.supportReport().contains("private-"))
    }

    func testHTTPFailuresAndMalformedBodiesAreReturnedForSDKHandling() async throws {
        let diagnostics = NestRequestDiagnostics()
        let request = privateRequest()
        let body = Data("invalid-private-json".utf8)
        for status in [200, 401, 429, 302] {
            let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
            let transport = NestAuthHTTP(diagnostics: diagnostics) { _ in (body, response) }
            let returned = try await transport.fetch(request)
            XCTAssertEqual(returned.0, body)
            XCTAssertTrue(returned.1 === response)
            XCTAssertEqual(diagnostics.snapshot().last?.status, status)
            XCTAssertEqual(diagnostics.snapshot().last?.outcome, status == 200 ? .success : .http)
        }
        XCTAssertEqual(Set(diagnostics.snapshot().map(\.requestId)).count, 4)
        XCTAssertFalse(try diagnostics.supportReport().contains("private-json"))
    }

    func testTransportFailuresAndCancellationPreserveOriginalErrors() async throws {
        let samples: [(Error, NestRequestOutcome)] = [
            (URLError(.timedOut), .timeout), (URLError(.networkConnectionLost), .offline),
            (URLError(.cancelled), .cancelled), (CancellationError(), .cancelled), (OriginalFailure(), .transport),
        ]
        for (original, outcome) in samples {
            let diagnostics = NestRequestDiagnostics()
            let transport = NestAuthHTTP(diagnostics: diagnostics) { _ in throw original }
            do {
                _ = try await transport.fetch(privateRequest())
                XCTFail("Expected original transport failure")
            } catch {
                XCTAssertEqual((error as? URLError)?.code, (original as? URLError)?.code)
                XCTAssertEqual(error is CancellationError, original is CancellationError)
                XCTAssertTrue((error as? OriginalFailure) === (original as? OriginalFailure))
            }
            let record = try XCTUnwrap(diagnostics.snapshot().first)
            XCTAssertEqual(record.outcome, outcome)
            XCTAssertNil(record.status)
            XCTAssertFalse(try diagnostics.supportReport().contains("private-"))
        }
    }

    func testNonHTTPResponsesAndUnexpectedMethodsDoNotChangeSDKBehaviorOrLeakContent() async throws {
        let diagnostics = NestRequestDiagnostics()
        var request = privateRequest()
        request.httpMethod = "private-method"
        let response = URLResponse(url: request.url!, mimeType: nil, expectedContentLength: 0, textEncodingName: nil)
        let transport = NestAuthHTTP(diagnostics: diagnostics) { received in
            XCTAssertEqual(received.httpMethod, "private-method")
            return (Data(), response)
        }
        let returned = try await transport.fetch(request)
        XCTAssertTrue(returned.1 === response)
        let record = try XCTUnwrap(diagnostics.snapshot().first)
        XCTAssertEqual(record.method, "OTHER")
        XCTAssertEqual(record.outcome, .response)
        XCTAssertNil(record.status)
        XCTAssertFalse(try diagnostics.supportReport().contains("private-"))
    }

    private func privateRequest() -> URLRequest {
        let url = URL(string: "https://private-origin.example/auth/v1/token?grant_type=private-query")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = Data("private-apple-id-and-refresh-token".utf8)
        request.httpShouldHandleCookies = false
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = 17
        request.setValue("Bearer private-access-token", forHTTPHeaderField: "Authorization")
        request.setValue("private-api-key", forHTTPHeaderField: "apikey")
        request.setValue("private-cookie", forHTTPHeaderField: "Cookie")
        request.setValue("private-existing-trace", forHTTPHeaderField: "traceparent")
        return request
    }

    private final class OriginalFailure: Error {}
}
