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
    func streamRequest(
        command: StartAssistantTurn, token: String, household: UUID, trace: NestRequestTrace = NestRequestTrace()
    ) throws -> URLRequest {
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
        http.diagnostics.addHeaders(to: &request, trace: trace)
        return request
    }

    func stream(
        command: StartAssistantTurn, token: String, household: UUID,
        receive: @Sendable (AssistantStreamFrame) async throws -> Void
    ) async throws {
        let trace = NestRequestTrace()
        let request = try streamRequest(command: command, token: token, household: household, trace: trace)
        let session = URLSession(configuration: .ephemeral)
        defer { session.invalidateAndCancel() }
        try await streamResponse(
            request: request, trace: trace,
            connect: { request in try await session.bytes(for: request, delegate: NoRedirects()) }, receive: receive)
    }

    func streamResponse<Bytes: AsyncSequence & Sendable>(
        request: URLRequest, trace: NestRequestTrace,
        connect: @Sendable (URLRequest) async throws -> (Bytes, URLResponse),
        receive: @Sendable (AssistantStreamFrame) async throws -> Void
    ) async throws where Bytes.Element == UInt8 {
        var progress = AssistantStreamProgress()
        var status: Int?
        defer {
            http.diagnostics.record(trace, route: .assistant, method: "POST", status: status, outcome: progress.outcome)
        }
        do {
            let (bytes, response) = try await connect(request)
            progress.outcome = .response
            guard let response = response as? HTTPURLResponse else { throw NestAPIFailure.unavailable }
            status = response.statusCode
            progress.outcome = response.statusCode == 200 ? .response : .http
            try Self.validateStreamResponse(response)
            progress.outcome = .transport
            for try await byte in bytes {
                try Task.checkCancellation()
                if let frame = try progress.consume(byte) {
                    try await receive(frame)
                    progress.outcome = .transport
                }
            }
            try progress.finish()
        } catch {
            progress.failed(error)
            throw error
        }
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

private struct AssistantStreamProgress {
    private var decoder = AssistantStreamBytes()
    private var serverFailure: NestRequestOutcome?
    var outcome = NestRequestOutcome.transport

    mutating func consume(_ byte: UInt8) throws -> AssistantStreamFrame? {
        outcome = .decoding
        guard let frame = try decoder.consume(byte) else {
            outcome = .transport
            return nil
        }
        if case .event(let event) = frame {
            switch event["type"]?.string {
            case "error": serverFailure = .streamFailure
            case "abort": serverFailure = .streamAborted
            default: break
            }
        }
        outcome = serverFailure ?? .consumerFailure
        return frame
    }

    mutating func finish() throws {
        outcome = .streamIncomplete
        try decoder.finish()
        outcome = serverFailure ?? .success
    }

    mutating func failed(_ error: Error) {
        let transport = NestRequestOutcome.transport(error)
        if transport == .cancelled { outcome = .cancelled } else if outcome == .transport { outcome = transport }
    }
}
