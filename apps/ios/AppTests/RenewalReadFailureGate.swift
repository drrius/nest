import Foundation

@testable import Nest

actor RenewalReadFailureGate {
    enum Mode: Sendable {
        case online, offline, listOffline
        case status(Int, code: String = "not_a_member")
        case malformed
    }
    private var mode = Mode.online
    private var pause = false
    private var arrived = false
    private var started: CheckedContinuation<Void, Never>?
    private var releaseRead: CheckedContinuation<Void, Never>?

    func set(_ value: Mode) { mode = value }
    func pauseNextRead() { pause = true }
    func waitForRead() async {
        if arrived { return }
        await withCheckedContinuation { started = $0 }
    }
    func release() {
        releaseRead?.resume()
        releaseRead = nil
    }

    func respond(
        _ request: URLRequest, live: @Sendable () async throws -> (Data, URLResponse)
    ) async throws -> (Data, URLResponse) {
        guard request.httpMethod == "GET", request.url!.path.hasPrefix("/v1/renewals") else {
            return try await live()
        }
        if pause {
            let captured = try await live()
            pause = false
            arrived = true
            started?.resume()
            started = nil
            await withCheckedContinuation { releaseRead = $0 }
            return captured
        }
        switch mode {
        case .online: return try await live()
        case .offline: throw URLError(.notConnectedToInternet)
        case .listOffline:
            if request.url!.path == "/v1/renewals" { throw URLError(.notConnectedToInternet) }
            return try await live()
        case .status(let status, let code):
            let data = Data("{\"error\":{\"code\":\"\(code)\"}}".utf8)
            return (data, HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
        case .malformed:
            return (
                Data("{}".utf8),
                HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            )
        }
    }
}

extension RenewalTestServer {
    func seedRead(_ value: CalendarRenewal) { renewal = value }
}
