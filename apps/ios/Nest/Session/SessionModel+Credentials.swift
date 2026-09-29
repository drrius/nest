import Foundation

extension SessionModel {
    func signOut() async {
        guard let auth else { return }
        generation += 1
        let attempt = generation
        status = .loading
        await clearPresentation()
        guard generation == attempt else { return }
        do {
            try await serializeCredentials { try await auth.signOut() }
            if generation == attempt { status = .signedOut }
        } catch {
            if generation == attempt { status = .unavailable }
        }
    }

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
