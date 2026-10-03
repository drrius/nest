import SwiftUI
import UIKit
import XCTest

@testable import Nest

/// Opted-in form inspection with fictional transport; never phone or hosted acceptance.
@MainActor
final class LegacyConfirmationPresentationFixtureTests: XCTestCase {
    func testInspectNewExpenseReviewOnOwnedSimulator() async throws {
        #if targetEnvironment(simulator)
            let environment = ProcessInfo.processInfo.environment
            guard environment["NEST_TEST_CONFIRMATION_PRESENTATION"] == "inspect" else {
                throw XCTSkip("Requires explicit draft-conversion form inspection.")
            }
            guard environment["SIMULATOR_UDID"] == "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A" else {
                return XCTFail("Draft-conversion inspection requires the owned clean simulator")
            }
            let complete = URL(filePath: "/private/tmp/nest-confirmation-presentation-complete")
            guard !FileManager.default.fileExists(atPath: complete.path) else {
                return XCTFail("Stale presentation completion marker")
            }
            let fixture = try await LegacyConfirmationTestFixture.make()
            let storage = fixture.base.url
            addTeardownBlock { try? FileManager.default.removeItem(at: storage) }
            let draft = await fixture.server.draftId
            let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
            let previous = scene.windows.first(where: \.isKeyWindow)
            let window = UIWindow(windowScene: scene)
            window.rootViewController = UIHostingController(rootView: form(fixture, draft: draft))
            window.makeKeyAndVisible()
            let previousHidden = previous?.isHidden
            previous?.isHidden = true
            defer {
                window.isHidden = true
                if let previousHidden { previous?.isHidden = previousHidden }
                previous?.makeKeyAndVisible()
                try? FileManager.default.removeItem(at: complete)
            }
            for _ in 0..<240 {
                if FileManager.default.fileExists(atPath: complete.path) {
                    let writes = await fixture.server.writes
                    let cancellations = await fixture.server.cancellationWrites
                    XCTAssertEqual(writes, 0)
                    XCTAssertEqual(cancellations, 0)
                    let context = try fixture.session.expenseContext()
                    let pending = try await fixture.session.savedLegacyConfirmation(context)
                    XCTAssertNil(pending)
                    return
                }
                try await Task.sleep(for: .seconds(1))
            }
            XCTFail("Draft-conversion form inspection did not finish")
        #else
            throw XCTSkip("Draft-conversion inspection is forbidden on physical devices.")
        #endif
    }

    private func form(_ fixture: LegacyConfirmationTestFixture, draft: UUID) -> some View {
        NavigationStack {
            LegacyConfirmationScreen(session: fixture.session, member: fixture.base.member, draftId: draft)
        }
        .tint(QuietPalette.accent)
    }
}
