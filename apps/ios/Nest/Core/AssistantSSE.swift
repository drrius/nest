import Foundation

enum AssistantStreamFrame: Equatable, Sendable {
    case event([String: AssistantJSON])
    case done
}

struct AssistantSSE {
    private var data: [String] = []
    private var frameBytes = 0
    private var totalBytes = 0
    private var done = false
    let maximumBytes: Int

    init(maximumBytes: Int = 8_388_608) { self.maximumBytes = maximumBytes }

    mutating func consume(line: String) throws -> AssistantStreamFrame? {
        let size = line.utf8.count + 1
        guard size <= maximumBytes, totalBytes <= maximumBytes - size else { throw NestAPIFailure.contract }
        totalBytes += size
        if line.isEmpty { return try flush() }
        guard !done else { throw NestAPIFailure.contract }
        if line.hasPrefix(":") { return nil }
        guard line == "data" || line.hasPrefix("data:") else { return nil }
        var content = line == "data" ? "" : String(line.dropFirst(5))
        if content.hasPrefix(" ") { content.removeFirst() }
        frameBytes += content.utf8.count + 1
        guard frameBytes <= 3_000_000 else { throw NestAPIFailure.contract }
        data.append(content)
        return nil
    }

    func finish() throws {
        guard done, data.isEmpty else { throw NestAPIFailure.unavailable }
    }

    private mutating func flush() throws -> AssistantStreamFrame? {
        guard !data.isEmpty else { return nil }
        let payload = data.joined(separator: "\n")
        data = []
        frameBytes = 0
        if payload == "[DONE]" {
            done = true
            return .done
        }
        guard let value = try? JSONDecoder().decode([String: AssistantJSON].self, from: Data(payload.utf8)),
            let type = value["type"]?.string, !type.isEmpty
        else { throw NestAPIFailure.contract }
        return .event(value)
    }
}
