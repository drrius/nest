import Foundation

struct NestAuthHTTP: Sendable {
    private let diagnostics: NestRequestDiagnostics
    private let transport: @Sendable (URLRequest) async throws -> (Data, URLResponse)

    init(
        diagnostics: NestRequestDiagnostics = .shared,
        transport: @escaping @Sendable (URLRequest) async throws -> (Data, URLResponse) = {
            try await URLSession.shared.data(for: $0)
        }
    ) {
        self.diagnostics = diagnostics
        self.transport = transport
    }

    func fetch(_ request: URLRequest) async throws -> (Data, URLResponse) {
        let trace = NestRequestTrace()
        let method = safeMethod(request.httpMethod)
        var status: Int?
        var outcome = NestRequestOutcome.transport
        defer { diagnostics.record(trace, route: .auth, method: method, status: status, outcome: outcome) }
        do {
            let result = try await transport(request)
            outcome = .response
            if let response = result.1 as? HTTPURLResponse {
                status = response.statusCode
                outcome = (200..<300).contains(response.statusCode) ? .success : .http
            }
            return result
        } catch {
            outcome = .transport(error)
            throw error
        }
    }

    private func safeMethod(_ method: String?) -> String {
        guard let method, ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].contains(method)
        else { return "OTHER" }
        return method
    }
}
