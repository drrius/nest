import CryptoKit
import Foundation

/// Random installation identity only. An APNs token is never cached here or exposed to UI.
@MainActor
final class PushInstallationIdentity {
    private let storage: SecureAuthStorage
    private let key = "installation/v1"

    init(environment: URL) {
        let digest = SHA256.hash(data: Data(environment.absoluteString.utf8))
            .map { String(format: "%02x", $0) }.joined()
        storage = SecureAuthStorage(service: "ch.drrius.nest.push-installation.\(digest)")
    }

    init(storage: SecureAuthStorage) { self.storage = storage }

    func read() throws -> UUID {
        if let data = try storage.retrieve(key: key) {
            guard let value = String(data: data, encoding: .utf8), let id = UUID(uuidString: value),
                value == id.uuidString.lowercased()
            else { throw OfflineFailure.storage }
            return id
        }
        let id = UUID()
        try storage.store(key: key, value: Data(id.uuidString.lowercased().utf8))
        guard try storage.retrieve(key: key) == Data(id.uuidString.lowercased().utf8) else {
            throw OfflineFailure.storage
        }
        return id
    }
}
