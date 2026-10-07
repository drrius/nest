import Foundation
import XCTest

@testable import NestCore

final class AssistantStreamDiagnosticsTests: XCTestCase {
    private let baseURL = URL(string: "https://nest.example/")!

    func testCompleteStreamSharesCorrelationAndRecordsOnlyAfterDelivery() async throws {
        let diagnostics = NestRequestDiagnostics()
        let api = AssistantAPI(http: try NestHTTP(baseURL: baseURL, diagnostics: diagnostics))
        let trace = NestRequestTrace()
        let command = StartAssistantTurn(
            conversationId: UUID(), operationId: UUID(), expectedRevision: "0", text: "private-chat-input")
        let household = UUID()
        let request = try api.streamRequest(
            command: command, token: "private-token", household: household, trace: trace)
        XCTAssertEqual(request.value(forHTTPHeaderField: "X-Nest-Request-ID"), trace.requestId.uuidString.lowercased())
        XCTAssertEqual(request.value(forHTTPHeaderField: "traceparent"), trace.traceparent)
        XCTAssertEqual(request.value(forHTTPHeaderField: "X-Nest-App-Version"), diagnostics.appVersion)
        XCTAssertEqual(request.value(forHTTPHeaderField: "X-Nest-App-Build"), diagnostics.appBuild)
        let payload =
            "data: {\"type\":\"text-delta\",\"id\":\"private-segment\",\"delta\":\"private-reply\"}\n\ndata: [DONE]\n\n"
        let bytes = stream(payload)
        let response = httpResponse(request)
        try await api.streamResponse(
            request: request, trace: trace, connect: { _ in (bytes, response) },
            receive: { _ in XCTAssertTrue(diagnostics.snapshot().isEmpty) })
        let record = try XCTUnwrap(diagnostics.snapshot().first)
        XCTAssertEqual(record.requestId, trace.requestId)
        XCTAssertEqual(record.traceparent, trace.traceparent)
        XCTAssertEqual(record.outcome, .success)
        XCTAssertEqual(record.route, .assistant)
        XCTAssertEqual(record.status, 200)
        XCTAssertGreaterThanOrEqual(record.durationMilliseconds, 0)
        let report = try diagnostics.supportReport()
        for privateValue in [
            "private-", command.conversationId.uuidString, command.operationId.uuidString, household.uuidString,
        ] {
            XCTAssertFalse(report.localizedCaseInsensitiveContains(privateValue))
        }
    }

    func testParserFramingHTTPAndResponseFailuresRemainDistinct() async throws {
        let samples: [(String, Int, String, NestAPIFailure, NestRequestOutcome)] = [
            ("data: invalid-private-json\n\n", 200, "text/event-stream", .contract, .decoding),
            ("data: [DONE]\n", 200, "text/event-stream", .unavailable, .streamIncomplete),
            ("", 401, "text/event-stream", .signedOut, .http),
            ("", 200, "text/html", .contract, .response),
        ]
        for (payload, status, mime, expectedError, outcome) in samples {
            let (record, error, report) = try await attempt(payload, status: status, mime: mime)
            XCTAssertEqual(error as? NestAPIFailure, expectedError)
            XCTAssertEqual(record.status, status)
            XCTAssertEqual(record.outcome, outcome)
            XCTAssertFalse(report.contains("private-json"))
        }
    }

    func testFixedServerFailuresAndConsumerFailurePreserveTheOriginalError() async throws {
        let samples: [(String, NestRequestOutcome)] = [
            ("error", .streamFailure), ("abort", .streamAborted), ("text-start", .consumerFailure),
        ]
        for (type, outcome) in samples {
            let payload = "data: {\"type\":\"\(type)\",\"errorText\":\"private-error-text\"}\n\ndata: [DONE]\n\n"
            let (record, error, report) = try await attempt(payload) { _ in throw Sentinel.original }
            XCTAssertEqual(error as? Sentinel, .original)
            XCTAssertEqual(record.outcome, outcome)
            XCTAssertFalse(report.contains("private-error-text"))
        }
        let (record, error, _) = try await attempt("data: {\"type\":\"error\"}\n\ndata: [DONE]\n\n")
        XCTAssertNil(error)
        XCTAssertEqual(record.outcome, .streamFailure)
    }

    func testCancellationAndDroppedStreamKeepTheOriginalErrors() async throws {
        let (cancelled, error, _) = try await attempt("data: [DONE]\n\n") { _ in throw CancellationError() }
        XCTAssertTrue(error is CancellationError)
        XCTAssertEqual(cancelled.outcome, .cancelled)
        let networkError = URLError(
            .networkConnectionLost, userInfo: [NSLocalizedDescriptionKey: "private-network-error"])
        let (lost, original, report) = try await attempt("", ending: networkError)
        XCTAssertEqual((original as? URLError)?.code, .networkConnectionLost)
        XCTAssertEqual(lost.outcome, .offline)
        XCTAssertEqual(lost.status, 200)
        XCTAssertFalse(report.contains("private-network-error"))
    }

    private func attempt(
        _ payload: String, status: Int = 200, mime: String = "text/event-stream", ending: Error? = nil,
        receive: @Sendable (AssistantStreamFrame) async throws -> Void = { _ in }
    ) async throws -> (NestRequestDiagnostic, Error?, String) {
        let diagnostics = NestRequestDiagnostics()
        let api = AssistantAPI(http: try NestHTTP(baseURL: baseURL, diagnostics: diagnostics))
        let trace = NestRequestTrace()
        let command = StartAssistantTurn(
            conversationId: UUID(), operationId: UUID(), expectedRevision: "0", text: "Hello")
        let request = try api.streamRequest(command: command, token: "fixture", household: UUID(), trace: trace)
        let bytes = stream(payload, ending: ending)
        let response = httpResponse(request, status: status, mime: mime)
        var original: Error?
        do {
            try await api.streamResponse(
                request: request, trace: trace, connect: { _ in (bytes, response) }, receive: receive)
        } catch { original = error }
        XCTAssertEqual(diagnostics.snapshot().count, 1)
        return (try XCTUnwrap(diagnostics.snapshot().first), original, try diagnostics.supportReport())
    }

    private func httpResponse(
        _ request: URLRequest, status: Int = 200, mime: String = "text/event-stream"
    ) -> HTTPURLResponse {
        HTTPURLResponse(
            url: request.url!, statusCode: status, httpVersion: nil,
            headerFields: ["Content-Type": mime, "x-vercel-ai-ui-message-stream": "v1"])!
    }

    private func stream(_ payload: String, ending: Error? = nil) -> AsyncThrowingStream<UInt8, Error> {
        AsyncThrowingStream { continuation in
            for byte in payload.utf8 { continuation.yield(byte) }
            continuation.finish(throwing: ending)
        }
    }

    private enum Sentinel: Error, Equatable { case original }
}
