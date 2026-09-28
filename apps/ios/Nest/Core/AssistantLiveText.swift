import Foundation

/// Presentation only: completion is always confirmed separately through the turn receipt.
struct AssistantLiveText {
    private var segments: [String: String] = [:]
    private var order: [String] = []
    private var ended: Set<String> = []
    private var bytes = 0
    var text: String { order.compactMap { segments[$0] }.joined(separator: "\n\n") }

    mutating func consume(_ frame: AssistantStreamFrame) throws {
        guard case .event(let part) = frame, let type = part["type"]?.string else { return }
        if type == "error" || type == "abort" { throw NestAPIFailure.unavailable }
        guard ["text-start", "text-delta", "text-end"].contains(type) else { return }
        guard let id = part["id"]?.string, !id.isEmpty else { throw NestAPIFailure.contract }
        switch type {
        case "text-start":
            guard segments[id] == nil, order.count < 1_000 else { throw NestAPIFailure.contract }
            order.append(id)
            segments[id] = ""
        case "text-delta":
            guard segments[id] != nil, !ended.contains(id), let delta = part["delta"]?.string,
                bytes <= 2_097_152 - delta.utf8.count
            else { throw NestAPIFailure.contract }
            bytes += delta.utf8.count
            segments[id, default: ""] += delta
        default:
            guard segments[id] != nil, ended.insert(id).inserted else { throw NestAPIFailure.contract }
        }
    }
}
