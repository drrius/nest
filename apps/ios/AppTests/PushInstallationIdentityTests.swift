import Foundation
import XCTest

@testable import Nest

@MainActor
final class PushInstallationIdentityTests: XCTestCase {
    func testProtectedIdentitySurvivesRestartAndIsSeparateFromAnotherInstallation() throws {
        let storage = SecureAuthStorage(service: "ch.drrius.nest.test.installation.\(UUID())")
        let second = SecureAuthStorage(service: "ch.drrius.nest.test.installation.\(UUID())")
        defer {
            try? storage.remove(key: "installation/v1")
            try? second.remove(key: "installation/v1")
        }
        let id = try PushInstallationIdentity(storage: storage).read()
        XCTAssertEqual(try PushInstallationIdentity(storage: storage).read(), id)
        XCTAssertNotEqual(try PushInstallationIdentity(storage: second).read(), id)
        let value = try XCTUnwrap(storage.retrieve(key: "installation/v1"))
        XCTAssertEqual(String(data: value, encoding: .utf8), id.uuidString.lowercased())
    }

    func testCorruptIdentityCannotSilentlyCreateAnotherInstallation() throws {
        let storage = SecureAuthStorage(service: "ch.drrius.nest.test.corrupt-installation.\(UUID())")
        defer { try? storage.remove(key: "installation/v1") }
        let corrupt = Data("not-a-uuid".utf8)
        try storage.store(key: "installation/v1", value: corrupt)
        XCTAssertThrowsError(try PushInstallationIdentity(storage: storage).read())
        XCTAssertEqual(try storage.retrieve(key: "installation/v1"), corrupt)
    }
}
