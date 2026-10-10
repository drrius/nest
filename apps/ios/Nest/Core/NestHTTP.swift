import Foundation

public enum NestAPIFailure: Error, Equatable {
    case configuration, signedOut, notMember, forbidden, conflict, cutover, removed, invalid, unavailable, contract
    case householdIncomplete
}

public struct NestHTTP: Sendable {
    let baseURL: URL
    private let transport: @Sendable (URLRequest) async throws -> (Data, URLResponse)
    let diagnostics: NestRequestDiagnostics

    public init(baseURL: URL, diagnostics: NestRequestDiagnostics = .shared) throws {
        try self.init(baseURL: baseURL, diagnostics: diagnostics) { request in
            try await URLSession.shared.data(for: request, delegate: NoRedirects())
        }
    }

    init(
        baseURL: URL,
        diagnostics: NestRequestDiagnostics = .shared,
        transport: @escaping @Sendable (URLRequest) async throws -> (Data, URLResponse)
    ) throws {
        guard baseURL.scheme == "https", baseURL.host != nil,
            baseURL.user == nil, baseURL.password == nil, baseURL.query == nil,
            baseURL.fragment == nil, baseURL.path.isEmpty || baseURL.path == "/"
        else { throw NestAPIFailure.configuration }
        self.baseURL = baseURL
        self.transport = transport
        self.diagnostics = diagnostics
    }

    public func read<Value: Decodable>(
        _ path: String, token: String, household: UUID? = nil,
        responseLimit: Int = 1_000_000, as type: Value.Type
    ) async throws -> Value {
        guard (1...3_000_000).contains(responseLimit) else { throw NestAPIFailure.configuration }
        return try await request(
            path, token: token, household: household, body: nil, responseLimit: responseLimit, as: type)
    }

    public func write<Body: Encodable, Value: Decodable>(
        _ path: String, token: String, household: UUID, body: Body, timeout: TimeInterval = 15, as type: Value.Type
    ) async throws -> Value {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let encoded = try encoder.encode(body)
        return try await request(path, token: token, household: household, body: encoded, timeout: timeout, as: type)
    }

    private func request<Value: Decodable>(
        _ path: String, token: String, household: UUID?, body: Data?, timeout: TimeInterval = 15,
        responseLimit: Int = 1_000_000, as type: Value.Type
    ) async throws -> Value {
        let trace = NestRequestTrace()
        let route = NestRequestRoute.category(path)
        let method = body == nil ? "GET" : "POST"
        var status: Int?
        var outcome = NestRequestOutcome.configuration
        defer { diagnostics.record(trace, route: route, method: method, status: status, outcome: outcome) }
        let request = try makeRequest(
            path, token: token, household: household, body: body, timeout: timeout, trace: trace)
        let (data, response): (Data, URLResponse)
        do { (data, response) = try await transport(request) } catch {
            outcome = .transport(error)
            throw NestAPIFailure.unavailable
        }
        outcome = .response
        guard let http = response as? HTTPURLResponse else { throw NestAPIFailure.unavailable }
        status = http.statusCode
        outcome = .responseSize
        guard data.count <= responseLimit else { throw NestAPIFailure.unavailable }
        outcome = .http
        guard http.statusCode == 200 else {
            let failure = failure(status: http.statusCode, data: data)
            if failure == .householdIncomplete { outcome = .householdIncomplete }
            throw failure
        }
        outcome = .decoding
        do {
            let value = try JSONDecoder().decode(type, from: data)
            outcome = .success
            return value
        } catch { throw NestAPIFailure.contract }
    }

    private func makeRequest(
        _ path: String, token: String, household: UUID?, body: Data?, timeout: TimeInterval, trace: NestRequestTrace
    ) throws -> URLRequest {
        guard timeout.isFinite, timeout > 0, timeout <= 180, !token.isEmpty, !path.hasPrefix("/"), !path.contains(".."),
            let url = URL(string: path, relativeTo: baseURL)?.absoluteURL,
            url.host == baseURL.host, url.scheme == "https"
        else { throw NestAPIFailure.configuration }
        var request = URLRequest(url: url)
        request.httpMethod = body == nil ? "GET" : "POST"
        request.httpBody = body
        request.timeoutInterval = timeout
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        diagnostics.addHeaders(to: &request, trace: trace)
        if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        if let household { request.setValue(household.uuidString.lowercased(), forHTTPHeaderField: "X-Nest-Household") }
        return request
    }

    private func failure(status: Int, data: Data) -> NestAPIFailure {
        switch status {
        case 400: .invalid
        case 401: .signedOut
        case 403:
            (try? JSONDecoder().decode(NestErrorEnvelope.self, from: data))?.error.code == "not_a_member"
                ? .notMember : .forbidden
        case 409: conflictFailure(data)
        case 410: .removed
        case 412: .conflict
        default: .unavailable
        }
    }

    private func conflictFailure(_ data: Data) -> NestAPIFailure {
        switch (try? JSONDecoder().decode(NestErrorEnvelope.self, from: data))?.error.code {
        case "household_incomplete": .householdIncomplete
        case "cutover": .cutover
        default: .conflict
        }
    }
}

private struct NestErrorEnvelope: Decodable {
    struct Detail: Decodable { let code: String }
    let error: Detail
}

final class NoRedirects: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(
        _ session: URLSession, task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        completionHandler(nil)
    }
}
