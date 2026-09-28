import Foundation

struct AssistantStreamBytes {
    private var line: [UInt8] = []
    private var count = 0
    private var parser = AssistantSSE()

    mutating func consume(_ byte: UInt8) throws -> AssistantStreamFrame? {
        count += 1
        guard count <= 8_388_608, line.count < 3_000_000 else { throw NestAPIFailure.contract }
        guard byte == 10 else {
            line.append(byte)
            return nil
        }
        if line.last == 13 { line.removeLast() }
        guard let text = String(bytes: line, encoding: .utf8) else { throw NestAPIFailure.contract }
        line.removeAll(keepingCapacity: true)
        return try parser.consume(line: text)
    }

    func finish() throws {
        guard line.isEmpty else { throw NestAPIFailure.unavailable }
        try parser.finish()
    }
}

extension AssistantAPI {
    func streamRequest(command: StartAssistantTurn, token: String, household: UUID) throws -> URLRequest {
        _ = try command.validated()
        guard !token.isEmpty else { throw NestAPIFailure.signedOut }
        var request = URLRequest(url: http.baseURL.appendingPathComponent("v1/assistant/turn"))
        request.httpMethod = "POST"
        request.httpBody = try JSONEncoder().encode(command)
        request.timeoutInterval = 180
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue(household.uuidString.lowercased(), forHTTPHeaderField: "X-Nest-Household")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        return request
    }

    func stream(
        command: StartAssistantTurn, token: String, household: UUID,
        receive: @Sendable (AssistantStreamFrame) async throws -> Void
    ) async throws {
        let request = try streamRequest(command: command, token: token, household: household)
        let session = URLSession(configuration: .ephemeral)
        defer { session.invalidateAndCancel() }
        let (bytes, response) = try await session.bytes(for: request, delegate: NoRedirects())
        guard let response = response as? HTTPURLResponse else { throw NestAPIFailure.unavailable }
        try Self.validateStreamResponse(response)
        var decoder = AssistantStreamBytes()
        for try await byte in bytes {
            try Task.checkCancellation()
            if let frame = try decoder.consume(byte) { try await receive(frame) }
        }
        try decoder.finish()
    }

    static func validateStreamResponse(_ response: HTTPURLResponse) throws {
        switch response.statusCode {
        case 200: break
        case 401: throw NestAPIFailure.signedOut
        case 403: throw NestAPIFailure.forbidden
        case 409, 412: throw NestAPIFailure.conflict
        case 410: throw NestAPIFailure.removed
        case 400: throw NestAPIFailure.invalid
        default: throw NestAPIFailure.unavailable
        }
        guard response.mimeType?.lowercased() == "text/event-stream",
            response.value(forHTTPHeaderField: "x-vercel-ai-ui-message-stream") == "v1"
        else { throw NestAPIFailure.contract }
    }
}
