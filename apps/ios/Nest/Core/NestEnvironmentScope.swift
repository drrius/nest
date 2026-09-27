import CryptoKit
import Foundation

struct NestEnvironmentScope: Sendable {
    let fingerprint: String

    init(url: URL) throws {
        guard url.scheme == "https", let host = url.host else { throw OfflineFailure.storage }
        let origin = "https://\(host.lowercased()):\(url.port ?? 443)"
        fingerprint = SHA256.hash(data: Data(origin.utf8))
            .map { String(format: "%02x", $0) }.joined()
    }
}
