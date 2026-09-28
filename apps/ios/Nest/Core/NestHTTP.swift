import Foundation

public enum NestAPIFailure: Error, Equatable {
    case configuration, signedOut, notMember, forbidden, conflict, cutover, removed, invalid, unavailable, contract
}

public struct NestHTTP: Sendable {
    private let baseURL: URL
    private let transport: @Sendable (URLRequest) async throws -> (Data, URLResponse)

    public init(baseURL: URL) throws {
        try self.init(baseURL: baseURL) { request in
            try await URLSession.shared.data(for: request, delegate: NoRedirects())
        }
    }

    init(
        baseURL: URL,
        transport: @escaping @Sendable (URLRequest) async throws -> (Data, URLResponse)
    ) throws {
        guard baseURL.scheme == "https", baseURL.host != nil,
            baseURL.user == nil, baseURL.password == nil, baseURL.query == nil,
            baseURL.fragment == nil, baseURL.path.isEmpty || baseURL.path == "/"
        else { throw NestAPIFailure.configuration }
        self.baseURL = baseURL
        self.transport = transport
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
        if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        if let household { request.setValue(household.uuidString.lowercased(), forHTTPHeaderField: "X-Nest-Household") }
        let (data, response): (Data, URLResponse)
        do { (data, response) = try await transport(request) } catch { throw NestAPIFailure.unavailable }
        guard let http = response as? HTTPURLResponse, data.count <= responseLimit
        else { throw NestAPIFailure.unavailable }
        guard http.statusCode == 200 else { throw failure(status: http.statusCode, data: data) }
        do { return try JSONDecoder().decode(type, from: data) } catch { throw NestAPIFailure.contract }
    }

    private func failure(status: Int, data: Data) -> NestAPIFailure {
        switch status {
        case 400: .invalid
        case 401: .signedOut
        case 403:
            (try? JSONDecoder().decode(NestErrorEnvelope.self, from: data))?.error.code == "not_a_member"
                ? .notMember : .forbidden
        case 409:
            (try? JSONDecoder().decode(NestErrorEnvelope.self, from: data))?.error.code == "cutover"
                ? .cutover : .conflict
        case 410: .removed
        case 412: .conflict
        default: .unavailable
        }
    }
}

private struct NestErrorEnvelope: Decodable {
    struct Detail: Decodable { let code: String }
    let error: Detail
}

private final class NoRedirects: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(
        _ session: URLSession, task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        completionHandler(nil)
    }
}
