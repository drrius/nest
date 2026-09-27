import Foundation

extension SessionModel {
    func serializeCredentials<Value: Sendable>(
        _ action: @escaping @Sendable () async throws -> Value
    ) async throws -> Value {
        credentialSequence += 1
        let sequence = credentialSequence
        let previous = credentialTail
        let mutation = Task {
            await previous?.value
            return try await action()
        }
        credentialTail = Task { _ = try? await mutation.value }
        do {
            let result = try await mutation.value
            if credentialSequence == sequence { credentialTail = nil }
            return result
        } catch {
            if credentialSequence == sequence { credentialTail = nil }
            throw error
        }
    }
}
