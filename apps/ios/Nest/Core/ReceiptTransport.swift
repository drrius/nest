import CryptoKit
import Foundation

struct ReceiptTransport: Sendable {
    let origin: URL
    let publishableKey: String
    private let transport: @Sendable (URLRequest) async throws -> (Data, URLResponse)

    init(origin: URL, publishableKey: String) throws {
        try self.init(origin: origin, publishableKey: publishableKey) { request in
            let configuration = URLSessionConfiguration.ephemeral
            configuration.httpShouldSetCookies = false
            let session = URLSession(configuration: configuration)
            defer { session.finishTasksAndInvalidate() }
            return try await session.data(for: request, delegate: ReceiptNoRedirects())
        }
    }

    init(
        origin: URL, publishableKey: String,
        transport: @escaping @Sendable (URLRequest) async throws -> (Data, URLResponse)
    ) throws {
        guard origin.scheme == "https", origin.host != nil, origin.user == nil, origin.password == nil,
            origin.query == nil, origin.fragment == nil, origin.path.isEmpty || origin.path == "/",
            publishableKey.hasPrefix("sb_publishable_"),
            !publishableKey.contains(where: { $0.isWhitespace })
        else { throw NestAPIFailure.configuration }
        self.origin = origin
        self.publishableKey = publishableKey
        self.transport = transport
    }

    static func input(data: Data, contentType: String, uploadId: UUID = UUID()) throws -> ReceiptUploadInput {
        try ReceiptUploadInput(
            uploadId: uploadId,
            sha256: SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined(),
            bytes: data.count, contentType: contentType
        ).validated()
    }

    func upload(input: ReceiptUploadInput, data: Data, token: String, member: VerifiedMember) async throws
        -> ReceiptUploadReservation
    {
        guard !token.isEmpty,
            try Self.input(data: data, contentType: input.contentType, uploadId: input.uploadId) == input
        else { throw NestAPIFailure.invalid }
        try Task.checkCancellation()
        let path = "functions/v1/nest-receipt-upload?uploadId=\(input.uploadId.uuidString.lowercased())"
        guard let url = URL(string: path, relativeTo: origin)?.absoluteURL else { throw NestAPIFailure.configuration }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = data
        request.timeoutInterval = 40
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.httpShouldHandleCookies = false
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue(member.householdId.uuidString.lowercased(), forHTTPHeaderField: "X-Nest-Household")
        request.setValue(publishableKey, forHTTPHeaderField: "apikey")
        request.setValue(input.contentType, forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let (body, response): (Data, URLResponse)
        do { (body, response) = try await transport(request) } catch { throw NestAPIFailure.unavailable }
        try Task.checkCancellation()
        guard let http = response as? HTTPURLResponse, body.count <= 16_384 else {
            throw NestAPIFailure.unavailable
        }
        guard http.statusCode == 201 else { throw failure(http.statusCode) }
        let result: ReceiptUploadReservation
        do { result = try JSONDecoder().decode(ReceiptUploadReservation.self, from: body) } catch {
            throw NestAPIFailure.contract
        }
        return try result.validated(member: member, input: input, requireStored: true)
    }

    private func failure(_ status: Int) -> NestAPIFailure {
        switch status {
        case 400, 413: .invalid
        case 401: .signedOut
        case 403: .forbidden
        case 409: .conflict
        default: .unavailable
        }
    }
}

private final class ReceiptNoRedirects: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(
        _ session: URLSession, task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        completionHandler(nil)
    }
}
