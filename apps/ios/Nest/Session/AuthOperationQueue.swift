import Foundation

actor AuthOperationQueue {
    private var tail: Task<Void, Never>?
    private var latest: UUID?

    func run<Value: Sendable>(
        _ action: @escaping @Sendable () async throws -> Value
    ) async throws -> Value {
        let operation = UUID()
        let previous = tail
        let task = Task {
            await previous?.value
            return try await action()
        }
        latest = operation
        tail = Task { _ = try? await task.value }
        defer {
            if latest == operation {
                tail = nil
                latest = nil
            }
        }
        return try await task.value
    }
}
