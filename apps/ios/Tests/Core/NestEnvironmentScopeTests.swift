import Foundation
import XCTest

@testable import NestCore

final class NestEnvironmentScopeTests: XCTestCase {
    func testDefaultHTTPSPortMatchesExplicit443ButNotAnotherPort() throws {
        let standard = try NestEnvironmentScope(url: URL(string: "https://supabase.example")!)
        let explicit = try NestEnvironmentScope(url: URL(string: "https://SUPABASE.example:443/")!)
        let separate = try NestEnvironmentScope(url: URL(string: "https://supabase.example:8443")!)
        XCTAssertEqual(standard.fingerprint, explicit.fingerprint)
        XCTAssertNotEqual(standard.fingerprint, separate.fingerprint)
    }
}
